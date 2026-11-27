using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Inventory;
using Commerce.Domain.Purchasing;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Services;

public sealed record SupplierInput(string Name, string? ContactName, string? Email, string? Phone,
    string? Address, string? Notes, bool IsActive);
public sealed record SupplierView(Guid Id, string Name, string? ContactName, string? Email, string? Phone,
    string? Address, string? Notes, bool IsActive, int OpenPurchaseOrders, decimal TotalPurchased);

public sealed record PurchaseOrderLineInput(Guid VariantId, int QuantityOrdered, decimal UnitCost);
public sealed record PurchaseOrderInput(Guid SupplierId, DateTime? ExpectedDateUtc, decimal TaxTotal,
    string? Notes, IReadOnlyList<PurchaseOrderLineInput> Items);
public sealed record PurchaseOrderItemView(Guid Id, Guid VariantId, string ProductName, string Sku,
    int QuantityOrdered, int QuantityReceived, decimal UnitCost, decimal LineTotal);
public sealed record PurchaseOrderListItem(Guid Id, string PoNumber, string SupplierName,
    PurchaseOrderStatus Status, DateTime OrderDateUtc, DateTime? ExpectedDateUtc, decimal Total, decimal AmountPaid);
public sealed record PurchaseOrderView(Guid Id, string PoNumber, Guid SupplierId, string SupplierName,
    PurchaseOrderStatus Status, DateTime OrderDateUtc, DateTime? ExpectedDateUtc, decimal Subtotal,
    decimal TaxTotal, decimal Total, decimal AmountPaid, string CurrencyCode, string? Notes,
    IReadOnlyList<PurchaseOrderItemView> Items, IReadOnlyList<GoodsReceiptView> Receipts);
public sealed record GoodsReceiptView(Guid Id, DateTime ReceivedAtUtc, Guid WarehouseId, string? Notes);
public sealed record ReceiveLineInput(Guid PurchaseOrderItemId, int Quantity);
public sealed record ReceiveInput(Guid WarehouseId, IReadOnlyList<ReceiveLineInput> Lines, string? Notes);
public sealed record SupplierPaymentInput(Guid SupplierId, Guid? PurchaseOrderId, decimal Amount, string Method,
    string? Reference, DateTime? PaidAtUtc = null);
public sealed record SupplierPaymentView(Guid Id, Guid SupplierId, string SupplierName, Guid? PurchaseOrderId,
    decimal Amount, string Method, string? Reference, DateTime PaidAtUtc);

public sealed class PurchasingService
{
    private readonly CommerceDbContext _db;
    private readonly AuditService _audit;
    private readonly OutboxService _outbox;
    private readonly InventoryService _inventory;

    public PurchasingService(CommerceDbContext db, AuditService audit, OutboxService outbox, InventoryService inventory)
    {
        _db = db;
        _audit = audit;
        _outbox = outbox;
        _inventory = inventory;
    }

    public async Task<IReadOnlyList<SupplierView>> ListSuppliersAsync(CancellationToken ct = default)
    {
        var suppliers = await _db.Suppliers.AsNoTracking().OrderBy(s => s.Name).ToListAsync(ct);
        var orders = await _db.PurchaseOrders.AsNoTracking()
            .GroupBy(p => p.SupplierId)
            .Select(g => new
            {
                SupplierId = g.Key,
                Open = g.Count(p => p.Status == PurchaseOrderStatus.Ordered || p.Status == PurchaseOrderStatus.PartiallyReceived),
                Total = g.Sum(p => p.Total)
            }).ToDictionaryAsync(x => x.SupplierId, ct);

        return suppliers.Select(s =>
        {
            var stats = orders.GetValueOrDefault(s.Id);
            return new SupplierView(s.Id, s.Name, s.ContactName, s.Email, s.Phone, s.Address, s.Notes,
                s.IsActive, stats?.Open ?? 0, stats?.Total ?? 0m);
        }).ToList();
    }

    public async Task<SupplierView> CreateSupplierAsync(SupplierInput input, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(input.Name))
            throw new DomainException(DomainErrors.Validation, "Supplier name is required.");
        var supplier = new Supplier
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            Name = input.Name.Trim(),
            ContactName = input.ContactName?.Trim(),
            Email = input.Email?.Trim().ToLowerInvariant(),
            Phone = input.Phone?.Trim(),
            Address = input.Address?.Trim(),
            Notes = input.Notes?.Trim(),
            IsActive = input.IsActive
        };
        _db.Suppliers.Add(supplier);
        _audit.Record("supplier.created", "Supplier", supplier.Id.ToString(), supplier.Name);
        await _db.SaveChangesAsync(ct);
        return new SupplierView(supplier.Id, supplier.Name, supplier.ContactName, supplier.Email, supplier.Phone,
            supplier.Address, supplier.Notes, supplier.IsActive, 0, 0m);
    }

    public async Task<SupplierView> UpdateSupplierAsync(Guid id, SupplierInput input, CancellationToken ct = default)
    {
        var supplier = await _db.Suppliers.FirstOrDefaultAsync(s => s.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Supplier not found.");
        if (string.IsNullOrWhiteSpace(input.Name))
            throw new DomainException(DomainErrors.Validation, "Supplier name is required.");

        supplier.Name = input.Name.Trim();
        supplier.ContactName = input.ContactName?.Trim();
        supplier.Email = input.Email?.Trim().ToLowerInvariant();
        supplier.Phone = input.Phone?.Trim();
        supplier.Address = input.Address?.Trim();
        supplier.Notes = input.Notes?.Trim();
        supplier.IsActive = input.IsActive;
        await _db.SaveChangesAsync(ct);

        var orders = await _db.PurchaseOrders.Where(p => p.SupplierId == id).ToListAsync(ct);
        return new SupplierView(supplier.Id, supplier.Name, supplier.ContactName, supplier.Email, supplier.Phone,
            supplier.Address, supplier.Notes, supplier.IsActive,
            orders.Count(p => p.Status is PurchaseOrderStatus.Ordered or PurchaseOrderStatus.PartiallyReceived),
            orders.Sum(p => p.Total));
    }

    public async Task DeleteSupplierAsync(Guid id, CancellationToken ct = default)
    {
        var supplier = await _db.Suppliers.FirstOrDefaultAsync(s => s.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Supplier not found.");
        if (await _db.PurchaseOrders.AnyAsync(p => p.SupplierId == id, ct))
            throw new DomainException(DomainErrors.Conflict, "This supplier has purchase orders and cannot be deleted.");
        _db.Suppliers.Remove(supplier);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<PagedResult<PurchaseOrderListItem>> ListPurchaseOrdersAsync(PurchaseOrderStatus? status,
        string? search, int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = _db.PurchaseOrders.AsNoTracking().AsQueryable();
        if (status is not null) query = query.Where(p => p.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(p => p.PoNumber.ToLower().Contains(term));
        }

        var total = await query.CountAsync(ct);
        var orders = await query.OrderByDescending(p => p.OrderDateUtc)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var supplierIds = orders.Select(p => p.SupplierId).Distinct().ToList();
        var suppliers = await _db.Suppliers.AsNoTracking().Where(s => supplierIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name, ct);

        var items = orders.Select(p => new PurchaseOrderListItem(p.Id, p.PoNumber,
            suppliers.GetValueOrDefault(p.SupplierId, ""), p.Status, p.OrderDateUtc, p.ExpectedDateUtc,
            p.Total, p.AmountPaid)).ToList();
        return new PagedResult<PurchaseOrderListItem>(items, page, pageSize, total);
    }

    public async Task<PurchaseOrderView> GetPurchaseOrderAsync(Guid id, CancellationToken ct = default)
    {
        var po = await _db.PurchaseOrders.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Purchase order not found.");
        var items = await _db.PurchaseOrderItems.AsNoTracking().Where(i => i.PurchaseOrderId == id).ToListAsync(ct);
        var supplier = await _db.Suppliers.AsNoTracking().FirstAsync(s => s.Id == po.SupplierId, ct);
        var receipts = await _db.GoodsReceipts.AsNoTracking().Where(r => r.PurchaseOrderId == id)
            .OrderByDescending(r => r.ReceivedAtUtc).ToListAsync(ct);
        return new PurchaseOrderView(po.Id, po.PoNumber, po.SupplierId, supplier.Name, po.Status,
            po.OrderDateUtc, po.ExpectedDateUtc, po.Subtotal, po.TaxTotal, po.Total, po.AmountPaid,
            po.CurrencyCode, po.Notes,
            items.Select(i => new PurchaseOrderItemView(i.Id, i.VariantId, i.ProductName, i.Sku,
                i.QuantityOrdered, i.QuantityReceived, i.UnitCost, i.LineTotal)).ToList(),
            receipts.Select(r => new GoodsReceiptView(r.Id, r.ReceivedAtUtc, r.WarehouseId, r.Notes)).ToList());
    }

    public async Task<PurchaseOrderView> CreatePurchaseOrderAsync(PurchaseOrderInput input, CancellationToken ct = default)
    {
        if (input.Items is null || input.Items.Count == 0)
            throw new DomainException(DomainErrors.Validation, "A purchase order needs at least one item.");
        if (input.TaxTotal < 0)
            throw new DomainException(DomainErrors.Validation, "Tax total cannot be negative.");
        var supplier = await _db.Suppliers.FirstOrDefaultAsync(s => s.Id == input.SupplierId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Supplier not found.");
        if (!supplier.IsActive)
            throw new DomainException(DomainErrors.Validation, "This supplier is inactive.");

        var variantIds = input.Items.Select(i => i.VariantId).Distinct().ToList();
        var variants = await _db.ProductVariants.Where(v => variantIds.Contains(v.Id)).ToDictionaryAsync(v => v.Id, ct);
        var products = await _db.Products.Where(p => variants.Values.Select(v => v.ProductId).Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);

        var po = new PurchaseOrder
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            PoNumber = await NextPoNumberAsync(ct),
            SupplierId = supplier.Id,
            Status = PurchaseOrderStatus.Draft,
            OrderDateUtc = DateTime.UtcNow,
            ExpectedDateUtc = input.ExpectedDateUtc,
            TaxTotal = Money.Round(input.TaxTotal),
            Notes = input.Notes?.Trim(),
            CurrencyCode = (await _db.Workspaces.AsNoTracking().FirstAsync(w => w.Id == _db.CurrentWorkspaceId, ct)).CurrencyCode
        };

        var items = new List<PurchaseOrderItem>();
        foreach (var line in input.Items)
        {
            if (line.QuantityOrdered <= 0)
                throw new DomainException(DomainErrors.Validation, "Ordered quantity must be greater than zero.");
            if (line.UnitCost < 0)
                throw new DomainException(DomainErrors.Validation, "Unit cost cannot be negative.");
            var variant = variants.GetValueOrDefault(line.VariantId)
                ?? throw new DomainException(DomainErrors.NotFound, "Product variant not found.");
            var product = products.GetValueOrDefault(variant.ProductId)
                ?? throw new DomainException(DomainErrors.NotFound, "Product not found.");

            items.Add(new PurchaseOrderItem
            {
                TenantId = _db.CurrentTenantId,
                WorkspaceId = _db.CurrentWorkspaceId,
                PurchaseOrderId = po.Id,
                VariantId = variant.Id,
                ProductName = product.Name,
                Sku = variant.Sku,
                QuantityOrdered = line.QuantityOrdered,
                UnitCost = Money.Round(line.UnitCost),
                LineTotal = Money.Round(line.UnitCost * line.QuantityOrdered)
            });
        }

        po.Subtotal = items.Sum(i => i.LineTotal);
        po.Total = Money.Round(po.Subtotal + po.TaxTotal);
        _db.PurchaseOrders.Add(po);
        _db.PurchaseOrderItems.AddRange(items);
        _audit.Record("purchase_order.created", "PurchaseOrder", po.Id.ToString(), po.PoNumber);
        await _db.SaveChangesAsync(ct);
        return await GetPurchaseOrderAsync(po.Id, ct);
    }

    public async Task<PurchaseOrderView> MarkOrderedAsync(Guid id, CancellationToken ct = default)
    {
        var po = await _db.PurchaseOrders.FirstOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Purchase order not found.");
        if (po.Status != PurchaseOrderStatus.Draft)
            throw new DomainException(DomainErrors.InvalidState, "Only draft purchase orders can be ordered.");
        po.Status = PurchaseOrderStatus.Ordered;
        await _db.SaveChangesAsync(ct);
        return await GetPurchaseOrderAsync(id, ct);
    }

    public async Task<PurchaseOrderView> CancelAsync(Guid id, CancellationToken ct = default)
    {
        var po = await _db.PurchaseOrders.FirstOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Purchase order not found.");
        if (po.Status is PurchaseOrderStatus.Received or PurchaseOrderStatus.Cancelled)
            throw new DomainException(DomainErrors.InvalidState, "This purchase order cannot be cancelled.");
        po.Status = PurchaseOrderStatus.Cancelled;
        await _db.SaveChangesAsync(ct);
        return await GetPurchaseOrderAsync(id, ct);
    }

    public async Task<PurchaseOrderView> ReceiveAsync(Guid id, ReceiveInput input, CancellationToken ct = default)
    {
        var po = await _db.PurchaseOrders.FirstOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Purchase order not found.");
        if (po.Status is PurchaseOrderStatus.Draft or PurchaseOrderStatus.Cancelled or PurchaseOrderStatus.Received)
            throw new DomainException(DomainErrors.InvalidState, "This purchase order cannot receive stock.");

        var warehouse = await _db.Warehouses.FirstOrDefaultAsync(w => w.Id == input.WarehouseId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Warehouse not found.");
        var items = await _db.PurchaseOrderItems.Where(i => i.PurchaseOrderId == id).ToListAsync(ct);

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        foreach (var line in input.Lines)
        {
            if (line.Quantity <= 0) continue;
            var item = items.FirstOrDefault(i => i.Id == line.PurchaseOrderItemId)
                ?? throw new DomainException(DomainErrors.NotFound, "Purchase order item not found.");
            var remaining = item.QuantityOrdered - item.QuantityReceived;
            if (line.Quantity > remaining)
                throw new DomainException(DomainErrors.Validation,
                    $"Cannot receive more than the remaining {remaining} unit(s) of {item.Sku}.");

            item.QuantityReceived += line.Quantity;
            var variant = await _db.ProductVariants.FirstOrDefaultAsync(v => v.Id == item.VariantId, ct);
            if (variant is not null)
            {
                variant.CostPrice = item.UnitCost;
                var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == variant.ProductId, ct);
                if (product is not null) product.CostPrice = item.UnitCost;
            }

            await _inventory.ApplyMovementAsync(warehouse.Id, item.VariantId, line.Quantity,
                StockMovementType.PurchaseReceipt, po.PoNumber, "Goods received", ct);

            _outbox.Enqueue("commerce.stock.changed", item.VariantId.ToString(), new
            {
                variantId = item.VariantId,
                warehouseId = warehouse.Id,
                change = line.Quantity,
                reference = po.PoNumber
            });
        }

        var fullyReceived = items.All(i => i.QuantityReceived >= i.QuantityOrdered);
        var anyReceived = items.Any(i => i.QuantityReceived > 0);
        po.Status = fullyReceived ? PurchaseOrderStatus.Received
            : anyReceived ? PurchaseOrderStatus.PartiallyReceived
            : po.Status;

        _db.GoodsReceipts.Add(new GoodsReceipt
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            PurchaseOrderId = po.Id,
            WarehouseId = warehouse.Id,
            Notes = input.Notes
        });
        _audit.Record("purchase_order.received", "PurchaseOrder", po.Id.ToString(), po.PoNumber);

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await GetPurchaseOrderAsync(id, ct);
    }

    public async Task<SupplierPaymentView> PaySupplierAsync(SupplierPaymentInput input, CancellationToken ct = default)
    {
        if (input.Amount <= 0)
            throw new DomainException(DomainErrors.Validation, "Payment amount must be greater than zero.");
        var supplier = await _db.Suppliers.FirstOrDefaultAsync(s => s.Id == input.SupplierId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Supplier not found.");

        var payment = new SupplierPayment
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            SupplierId = supplier.Id,
            PurchaseOrderId = input.PurchaseOrderId,
            Amount = Money.Round(input.Amount),
            Method = string.IsNullOrWhiteSpace(input.Method) ? "bank" : input.Method,
            Reference = input.Reference,
            PaidAtUtc = input.PaidAtUtc ?? DateTime.UtcNow
        };
        _db.SupplierPayments.Add(payment);

        if (input.PurchaseOrderId is not null)
        {
            var po = await _db.PurchaseOrders.FirstOrDefaultAsync(p => p.Id == input.PurchaseOrderId, ct);
            if (po is not null) po.AmountPaid = Money.Round(po.AmountPaid + payment.Amount);
        }

        _audit.Record("supplier.paid", "Supplier", supplier.Id.ToString(), $"{payment.Amount:0.00}");
        await _db.SaveChangesAsync(ct);
        return new SupplierPaymentView(payment.Id, supplier.Id, supplier.Name, payment.PurchaseOrderId,
            payment.Amount, payment.Method, payment.Reference, payment.PaidAtUtc);
    }

    public async Task<IReadOnlyList<SupplierPaymentView>> ListSupplierPaymentsAsync(CancellationToken ct = default)
    {
        var payments = await _db.SupplierPayments.AsNoTracking().OrderByDescending(p => p.PaidAtUtc).Take(200).ToListAsync(ct);
        var supplierIds = payments.Select(p => p.SupplierId).Distinct().ToList();
        var suppliers = await _db.Suppliers.AsNoTracking().Where(s => supplierIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name, ct);
        return payments.Select(p => new SupplierPaymentView(p.Id, p.SupplierId, suppliers.GetValueOrDefault(p.SupplierId, ""),
            p.PurchaseOrderId, p.Amount, p.Method, p.Reference, p.PaidAtUtc)).ToList();
    }

    private async Task<string> NextPoNumberAsync(CancellationToken ct)
    {
        var count = await _db.PurchaseOrders.CountAsync(ct);
        var next = 2001 + count;
        var candidate = $"PO-{next}";
        while (await _db.PurchaseOrders.AnyAsync(p => p.PoNumber == candidate, ct))
            candidate = $"PO-{++next}";
        return candidate;
    }
}
