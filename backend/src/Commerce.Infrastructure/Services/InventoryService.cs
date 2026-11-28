using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Inventory;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Services;

public sealed record WarehouseInput(string Name, string Code, string? Address, bool IsDefault);
public sealed record WarehouseView(Guid Id, string Name, string Code, string? Address, bool IsDefault,
    bool IsActive, int VariantCount, int UnitsOnHand);
public sealed record StockRow(Guid VariantId, Guid ProductId, string ProductName, string VariantName, string Sku,
    Guid WarehouseId, string WarehouseName, int OnHand, int Reserved, int Available, int ReorderPoint,
    int ReorderQuantity, decimal CostPrice, decimal Price);
public sealed record AdjustStockRequest(Guid WarehouseId, Guid VariantId, int QuantityDelta, string? Note);
public sealed record TransferStockRequest(Guid FromWarehouseId, Guid ToWarehouseId, Guid VariantId, int Quantity, string? Note);
public sealed record ReorderSettingsRequest(int ReorderPoint, int ReorderQuantity);
public sealed record StockMovementView(Guid Id, Guid WarehouseId, string WarehouseName, Guid VariantId,
    string ProductName, string Sku, StockMovementType Type, int Quantity, int BalanceAfter, string? Reference,
    string? Note, DateTime CreatedAtUtc);

public sealed class InventoryService
{
    private readonly CommerceDbContext _db;
    private readonly AuditService _audit;

    public InventoryService(CommerceDbContext db, AuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    public async Task<Warehouse> GetDefaultWarehouseAsync(CancellationToken ct = default) =>
        await _db.Warehouses.FirstOrDefaultAsync(w => w.IsDefault && w.IsActive, ct)
        ?? await _db.Warehouses.FirstOrDefaultAsync(w => w.IsActive, ct)
        ?? throw new DomainException(DomainErrors.NotFound, "No warehouse is configured.");

    public async Task<IReadOnlyList<WarehouseView>> ListWarehousesAsync(CancellationToken ct = default)
    {
        var warehouses = await _db.Warehouses.AsNoTracking().OrderByDescending(w => w.IsDefault).ThenBy(w => w.Name).ToListAsync(ct);
        var stats = await _db.StockItems.AsNoTracking()
            .GroupBy(s => s.WarehouseId)
            .Select(g => new { WarehouseId = g.Key, Variants = g.Count(), Units = g.Sum(s => s.QuantityOnHand) })
            .ToDictionaryAsync(x => x.WarehouseId, ct);
        return warehouses.Select(w =>
        {
            var s = stats.GetValueOrDefault(w.Id);
            return new WarehouseView(w.Id, w.Name, w.Code, w.Address, w.IsDefault, w.IsActive,
                s?.Variants ?? 0, s?.Units ?? 0);
        }).ToList();
    }

    public async Task<WarehouseView> CreateWarehouseAsync(WarehouseInput input, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(input.Name) || string.IsNullOrWhiteSpace(input.Code))
            throw new DomainException(DomainErrors.Validation, "Warehouse name and code are required.");
        var code = input.Code.Trim().ToUpperInvariant();
        if (await _db.Warehouses.AnyAsync(w => w.Code == code, ct))
            throw new DomainException(DomainErrors.Conflict, "A warehouse with this code already exists.");

        if (input.IsDefault)
            foreach (var w in await _db.Warehouses.Where(w => w.IsDefault).ToListAsync(ct)) w.IsDefault = false;

        var warehouse = new Warehouse
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            Name = input.Name.Trim(),
            Code = code,
            Address = input.Address?.Trim(),
            IsDefault = input.IsDefault || !await _db.Warehouses.AnyAsync(ct)
        };
        _db.Warehouses.Add(warehouse);
        _audit.Record("warehouse.created", "Warehouse", warehouse.Id.ToString(), warehouse.Name);
        await _db.SaveChangesAsync(ct);
        return new WarehouseView(warehouse.Id, warehouse.Name, warehouse.Code, warehouse.Address,
            warehouse.IsDefault, warehouse.IsActive, 0, 0);
    }

    public async Task<WarehouseView> UpdateWarehouseAsync(Guid id, WarehouseInput input, CancellationToken ct = default)
    {
        var warehouse = await _db.Warehouses.FirstOrDefaultAsync(w => w.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Warehouse not found.");
        if (string.IsNullOrWhiteSpace(input.Name) || string.IsNullOrWhiteSpace(input.Code))
            throw new DomainException(DomainErrors.Validation, "Warehouse name and code are required.");
        var code = input.Code.Trim().ToUpperInvariant();
        if (await _db.Warehouses.AnyAsync(w => w.Code == code && w.Id != id, ct))
            throw new DomainException(DomainErrors.Conflict, "A warehouse with this code already exists.");

        if (input.IsDefault && !warehouse.IsDefault)
            foreach (var w in await _db.Warehouses.Where(w => w.IsDefault).ToListAsync(ct)) w.IsDefault = false;

        warehouse.Name = input.Name.Trim();
        warehouse.Code = code;
        warehouse.Address = input.Address?.Trim();
        warehouse.IsDefault = input.IsDefault || warehouse.IsDefault;
        await _db.SaveChangesAsync(ct);

        var stock = await _db.StockItems.Where(s => s.WarehouseId == id).ToListAsync(ct);
        return new WarehouseView(warehouse.Id, warehouse.Name, warehouse.Code, warehouse.Address,
            warehouse.IsDefault, warehouse.IsActive, stock.Count, stock.Sum(s => s.QuantityOnHand));
    }

    public async Task DeleteWarehouseAsync(Guid id, CancellationToken ct = default)
    {
        var warehouse = await _db.Warehouses.FirstOrDefaultAsync(w => w.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Warehouse not found.");
        if (await _db.StockItems.AnyAsync(s => s.WarehouseId == id && s.QuantityOnHand != 0, ct))
            throw new DomainException(DomainErrors.Conflict, "Transfer or adjust stock to zero before deleting this warehouse.");
        if (warehouse.IsDefault)
            throw new DomainException(DomainErrors.Conflict, "Choose another default warehouse first.");
        _db.Warehouses.Remove(warehouse);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<PagedResult<StockRow>> ListStockAsync(string? search, Guid? warehouseId, bool lowStockOnly,
        int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = from s in _db.StockItems.AsNoTracking()
                    join v in _db.ProductVariants.AsNoTracking() on s.VariantId equals v.Id
                    join p in _db.Products.AsNoTracking() on v.ProductId equals p.Id
                    join w in _db.Warehouses.AsNoTracking() on s.WarehouseId equals w.Id
                    where !p.IsDeleted
                    select new { s, v, p, w };

        if (warehouseId is not null) query = query.Where(x => x.s.WarehouseId == warehouseId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(x => x.p.Name.ToLower().Contains(term) || x.v.Sku.ToLower().Contains(term));
        }
        if (lowStockOnly)
            query = query.Where(x => x.s.ReorderPoint > 0 && x.s.QuantityOnHand - x.s.QuantityReserved <= x.s.ReorderPoint);

        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.p.Name).ThenBy(x => x.v.Sku)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        var items = rows.Select(x => new StockRow(x.v.Id, x.p.Id, x.p.Name, x.v.Name, x.v.Sku,
            x.s.WarehouseId, x.w.Name, x.s.QuantityOnHand, x.s.QuantityReserved,
            x.s.QuantityOnHand - x.s.QuantityReserved, x.s.ReorderPoint, x.s.ReorderQuantity,
            x.v.CostPrice, x.v.Price)).ToList();

        return new PagedResult<StockRow>(items, page, pageSize, total);
    }

    public async Task<IReadOnlyList<StockRow>> LowStockAsync(CancellationToken ct = default)
    {
        var result = await ListStockAsync(null, null, true, 1, 200, ct);
        return result.Items;
    }

    public async Task<StockRow> AdjustAsync(AdjustStockRequest request, CancellationToken ct = default)
    {
        if (request.QuantityDelta == 0)
            throw new DomainException(DomainErrors.Validation, "Adjustment quantity cannot be zero.");

        var warehouse = await _db.Warehouses.FirstOrDefaultAsync(w => w.Id == request.WarehouseId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Warehouse not found.");
        var variant = await _db.ProductVariants.FirstOrDefaultAsync(v => v.Id == request.VariantId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product variant not found.");
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == variant.ProductId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product not found.");

        var stock = await _db.StockItems.FirstOrDefaultAsync(s => s.WarehouseId == warehouse.Id && s.VariantId == variant.Id, ct);
        if (stock is null)
        {
            stock = new StockItem
            {
                TenantId = _db.CurrentTenantId,
                WorkspaceId = _db.CurrentWorkspaceId,
                WarehouseId = warehouse.Id,
                VariantId = variant.Id
            };
            _db.StockItems.Add(stock);
        }

        var newQuantity = stock.QuantityOnHand + request.QuantityDelta;
        if (newQuantity < 0)
            throw new DomainException(DomainErrors.InsufficientStock, "Stock cannot be reduced below zero.");
        if (newQuantity < stock.QuantityReserved)
            throw new DomainException(DomainErrors.InsufficientStock, "Stock cannot be reduced below reserved quantities.");

        stock.QuantityOnHand = newQuantity;
        _db.StockMovements.Add(new StockMovement
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            WarehouseId = warehouse.Id,
            VariantId = variant.Id,
            Type = StockMovementType.Adjustment,
            Quantity = request.QuantityDelta,
            BalanceAfter = newQuantity,
            Note = request.Note,
            CreatedByUserId = _db.CurrentTenantId == Guid.Empty ? null : null
        });
        _audit.Record("stock.adjusted", "StockItem", stock.Id.ToString(),
            $"{variant.Sku}: {request.QuantityDelta:+#;-#;0} ({newQuantity} on hand)");
        await _db.SaveChangesAsync(ct);
        return new StockRow(variant.Id, product.Id, product.Name, variant.Name, variant.Sku,
            warehouse.Id, warehouse.Name, stock.QuantityOnHand, stock.QuantityReserved,
            stock.QuantityOnHand - stock.QuantityReserved, stock.ReorderPoint, stock.ReorderQuantity,
            variant.CostPrice, variant.Price);
    }

    public async Task TransferAsync(TransferStockRequest request, CancellationToken ct = default)
    {
        if (request.Quantity <= 0)
            throw new DomainException(DomainErrors.Validation, "Transfer quantity must be greater than zero.");
        if (request.FromWarehouseId == request.ToWarehouseId)
            throw new DomainException(DomainErrors.Validation, "Choose two different warehouses.");

        var from = await _db.Warehouses.FirstOrDefaultAsync(w => w.Id == request.FromWarehouseId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Source warehouse not found.");
        var to = await _db.Warehouses.FirstOrDefaultAsync(w => w.Id == request.ToWarehouseId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Destination warehouse not found.");
        var variant = await _db.ProductVariants.FirstOrDefaultAsync(v => v.Id == request.VariantId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product variant not found.");
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == variant.ProductId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product not found.");

        var source = await _db.StockItems.FirstOrDefaultAsync(s => s.WarehouseId == from.Id && s.VariantId == variant.Id, ct);
        if (source is null || source.QuantityOnHand - source.QuantityReserved < request.Quantity)
            throw new DomainException(DomainErrors.InsufficientStock, "Not enough available stock in the source warehouse.");

        var destination = await _db.StockItems.FirstOrDefaultAsync(s => s.WarehouseId == to.Id && s.VariantId == variant.Id, ct);
        if (destination is null)
        {
            destination = new StockItem
            {
                TenantId = _db.CurrentTenantId,
                WorkspaceId = _db.CurrentWorkspaceId,
                WarehouseId = to.Id,
                VariantId = variant.Id,
                ReorderPoint = source.ReorderPoint,
                ReorderQuantity = source.ReorderQuantity
            };
            _db.StockItems.Add(destination);
        }

        source.QuantityOnHand -= request.Quantity;
        destination.QuantityOnHand += request.Quantity;

        _db.StockMovements.AddRange(
            new StockMovement
            {
                TenantId = _db.CurrentTenantId, WorkspaceId = _db.CurrentWorkspaceId,
                WarehouseId = from.Id, VariantId = variant.Id, Type = StockMovementType.TransferOut,
                Quantity = -request.Quantity, BalanceAfter = source.QuantityOnHand,
                Reference = to.Code, Note = request.Note
            },
            new StockMovement
            {
                TenantId = _db.CurrentTenantId, WorkspaceId = _db.CurrentWorkspaceId,
                WarehouseId = to.Id, VariantId = variant.Id, Type = StockMovementType.TransferIn,
                Quantity = request.Quantity, BalanceAfter = destination.QuantityOnHand,
                Reference = from.Code, Note = request.Note
            });

        _audit.Record("stock.transferred", "Product", product.Id.ToString(),
            $"{variant.Sku}: {request.Quantity} from {from.Code} to {to.Code}");
        await _db.SaveChangesAsync(ct);
    }

    public async Task<PagedResult<StockMovementView>> ListMovementsAsync(Guid? variantId, Guid? warehouseId,
        StockMovementType? type, int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = _db.StockMovements.AsNoTracking().AsQueryable();
        if (variantId is not null) query = query.Where(m => m.VariantId == variantId);
        if (warehouseId is not null) query = query.Where(m => m.WarehouseId == warehouseId);
        if (type is not null) query = query.Where(m => m.Type == type);

        var total = await query.CountAsync(ct);
        var movements = await query.OrderByDescending(m => m.CreatedAtUtc)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        var variantIds = movements.Select(m => m.VariantId).Distinct().ToList();
        var warehouseIds = movements.Select(m => m.WarehouseId).Distinct().ToList();
        var variants = await _db.ProductVariants.AsNoTracking().Where(v => variantIds.Contains(v.Id))
            .ToDictionaryAsync(v => v.Id, ct);
        var products = await _db.Products.AsNoTracking()
            .Where(p => variants.Values.Select(v => v.ProductId).Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Name, ct);
        var warehouses = await _db.Warehouses.AsNoTracking().Where(w => warehouseIds.Contains(w.Id))
            .ToDictionaryAsync(w => w.Id, w => w.Name, ct);

        var items = movements.Select(m =>
        {
            var variant = variants.GetValueOrDefault(m.VariantId);
            return new StockMovementView(m.Id, m.WarehouseId, warehouses.GetValueOrDefault(m.WarehouseId, ""),
                m.VariantId,
                variant is not null ? products.GetValueOrDefault(variant.ProductId, "") : "",
                variant?.Sku ?? "", m.Type, m.Quantity, m.BalanceAfter, m.Reference, m.Note, m.CreatedAtUtc);
        }).ToList();

        return new PagedResult<StockMovementView>(items, page, pageSize, total);
    }

    public async Task UpdateReorderSettingsAsync(Guid warehouseId, Guid variantId, ReorderSettingsRequest request,
        CancellationToken ct = default)
    {
        if (request.ReorderPoint < 0 || request.ReorderQuantity < 0)
            throw new DomainException(DomainErrors.Validation, "Reorder values cannot be negative.");
        if (!await _db.Warehouses.AnyAsync(w => w.Id == warehouseId, ct))
            throw new DomainException(DomainErrors.NotFound, "Warehouse not found.");
        if (!await _db.ProductVariants.AnyAsync(v => v.Id == variantId, ct))
            throw new DomainException(DomainErrors.NotFound, "Product variant not found.");

        var stock = await _db.StockItems
            .FirstOrDefaultAsync(s => s.WarehouseId == warehouseId && s.VariantId == variantId, ct);
        if (stock is null)
        {
            stock = new StockItem
            {
                TenantId = _db.CurrentTenantId,
                WorkspaceId = _db.CurrentWorkspaceId,
                WarehouseId = warehouseId,
                VariantId = variantId
            };
            _db.StockItems.Add(stock);
        }
        stock.ReorderPoint = request.ReorderPoint;
        stock.ReorderQuantity = request.ReorderQuantity;
        stock.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Applies a stock delta and records a movement, without saving (caller owns the transaction).</summary>
    public async Task ApplyMovementAsync(Guid warehouseId, Guid variantId, int delta, StockMovementType type,
        string? reference, string? note, CancellationToken ct = default)
    {
        var stock = await _db.StockItems.FirstOrDefaultAsync(s => s.WarehouseId == warehouseId && s.VariantId == variantId, ct);
        if (stock is null)
        {
            stock = new StockItem
            {
                TenantId = _db.CurrentTenantId,
                WorkspaceId = _db.CurrentWorkspaceId,
                WarehouseId = warehouseId,
                VariantId = variantId
            };
            _db.StockItems.Add(stock);
        }
        stock.QuantityOnHand += delta;
        if (stock.QuantityOnHand < 0)
            throw new DomainException(DomainErrors.InsufficientStock, "Stock cannot go below zero.");
        _db.StockMovements.Add(new StockMovement
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            WarehouseId = warehouseId,
            VariantId = variantId,
            Type = type,
            Quantity = delta,
            BalanceAfter = stock.QuantityOnHand,
            Reference = reference,
            Note = note
        });
    }
}
