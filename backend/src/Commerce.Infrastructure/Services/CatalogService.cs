using System.Text;
using System.Text.RegularExpressions;
using Commerce.Domain;
using Commerce.Domain.Catalog;
using Commerce.Domain.Common;
using Commerce.Domain.Inventory;
using Commerce.Domain.Pricing;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Services;

public sealed record VariantInput(
    Guid? Id,
    string Name,
    string Sku,
    string? AttributesJson,
    decimal CostPrice,
    decimal Price,
    bool IsActive = true,
    bool IsDefault = false);

public sealed record ProductInput(
    string Name,
    string? Sku,
    string? ShortDescription,
    string? Description,
    Guid? CategoryId,
    Guid? BrandId,
    ProductStatus Status,
    decimal CostPrice,
    decimal BasePrice,
    decimal? CompareAtPrice,
    decimal TaxRate,
    bool IsFeatured,
    string? Tags,
    string? SeoTitle,
    string? SeoDescription,
    IReadOnlyList<VariantInput>? Variants,
    IReadOnlyList<string>? Images);

public sealed record VariantView(Guid Id, string Name, string Sku, string? AttributesJson,
    decimal Price, decimal CostPrice, bool IsActive, bool IsDefault, int OnHand, int Reserved);

public sealed record ProductListItem(Guid Id, string Name, string Sku, string? CategoryName, string? BrandName,
    ProductStatus Status, decimal Price, decimal CostPrice, int Stock, int Reserved, string CurrencyCode,
    string? ImageUrl, bool IsFeatured);

public sealed record ProductView(Guid Id, string Name, string Slug, string Sku, string? ShortDescription,
    string? Description, Guid? CategoryId, string? CategoryName, Guid? BrandId, string? BrandName,
    ProductStatus Status, decimal CostPrice, decimal BasePrice, decimal? CompareAtPrice, decimal TaxRate,
    string CurrencyCode, bool IsFeatured, string? Tags, string? SeoTitle, string? SeoDescription,
    IReadOnlyList<VariantView> Variants, IReadOnlyList<string> Images, int TotalOnHand, int TotalReserved);

public sealed record CategoryInput(string Name, Guid? ParentId, string? Description, bool IsActive, int SortOrder);
public sealed record CategoryView(Guid Id, string Name, string Slug, Guid? ParentId, string? Description,
    bool IsActive, int SortOrder, int ProductCount);
public sealed record BrandInput(string Name, string? LogoUrl);
public sealed record BrandView(Guid Id, string Name, string Slug, string? LogoUrl, int ProductCount);
public sealed record CsvImportResult(int Created, int Updated, int Skipped, IReadOnlyList<string> Errors);

public sealed class CatalogService
{
    private readonly CommerceDbContext _db;
    private readonly AuditService _audit;
    private readonly OutboxService _outbox;

    public CatalogService(CommerceDbContext db, AuditService audit, OutboxService outbox)
    {
        _db = db;
        _audit = audit;
        _outbox = outbox;
    }

    public async Task<PagedResult<ProductListItem>> ListProductsAsync(string? search, Guid? categoryId,
        Guid? brandId, ProductStatus? status, bool lowStockOnly, string? sort, int page, int pageSize,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = _db.Products.AsNoTracking().Where(p => !p.IsDeleted);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(p => p.Name.ToLower().Contains(term) || p.Sku.ToLower().Contains(term)
                || (p.Tags != null && p.Tags.ToLower().Contains(term)));
        }
        if (categoryId is not null) query = query.Where(p => p.CategoryId == categoryId);
        if (brandId is not null) query = query.Where(p => p.BrandId == brandId);
        if (status is not null) query = query.Where(p => p.Status == status);

        if (lowStockOnly)
        {
            var lowVariantIds = await _db.StockItems
                .Where(s => s.ReorderPoint > 0 && s.QuantityOnHand - s.QuantityReserved <= s.ReorderPoint)
                .Select(s => s.VariantId).Distinct().ToListAsync(ct);
            query = query.Where(p => _db.ProductVariants.Any(v => v.ProductId == p.Id && lowVariantIds.Contains(v.Id)));
        }

        var total = await query.CountAsync(ct);
        query = sort switch
        {
            "price_asc" => query.OrderBy(p => p.BasePrice),
            "price_desc" => query.OrderByDescending(p => p.BasePrice),
            "name" => query.OrderBy(p => p.Name),
            "stock" => query.OrderBy(p => p.Name),
            _ => query.OrderByDescending(p => p.CreatedAtUtc)
        };

        var products = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var productIds = products.Select(p => p.Id).ToList();
        var variants = await _db.ProductVariants.AsNoTracking().Where(v => productIds.Contains(v.ProductId)).ToListAsync(ct);
        var variantIds = variants.Select(v => v.Id).ToList();
        var stock = await _db.StockItems.AsNoTracking().Where(s => variantIds.Contains(s.VariantId))
            .GroupBy(s => s.VariantId)
            .Select(g => new { VariantId = g.Key, OnHand = g.Sum(s => s.QuantityOnHand), Reserved = g.Sum(s => s.QuantityReserved) })
            .ToDictionaryAsync(x => x.VariantId, ct);
        var categories = await _db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name, ct);
        var brands = await _db.Brands.AsNoTracking().ToDictionaryAsync(b => b.Id, b => b.Name, ct);
        var images = await _db.ProductImages.AsNoTracking().Where(i => productIds.Contains(i.ProductId))
            .OrderBy(i => i.SortOrder).ToListAsync(ct);

        var items = products.Select(p =>
        {
            var pv = variants.Where(v => v.ProductId == p.Id).ToList();
            var onHand = pv.Sum(v => stock.GetValueOrDefault(v.Id)?.OnHand ?? 0);
            var reserved = pv.Sum(v => stock.GetValueOrDefault(v.Id)?.Reserved ?? 0);
            var image = images.FirstOrDefault(i => i.ProductId == p.Id)?.Url;
            return new ProductListItem(p.Id, p.Name, p.Sku,
                p.CategoryId is not null ? categories.GetValueOrDefault(p.CategoryId.Value) : null,
                p.BrandId is not null ? brands.GetValueOrDefault(p.BrandId.Value) : null,
                p.Status, p.BasePrice, p.CostPrice, onHand, reserved, p.CurrencyCode, image, p.IsFeatured);
        }).ToList();

        return new PagedResult<ProductListItem>(items, page, pageSize, total);
    }

    public async Task<ProductView> GetProductAsync(Guid id, CancellationToken ct = default)
    {
        var p = await _db.Products.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product not found.");
        return await BuildViewAsync(p, ct);
    }

    public async Task<ProductView> CreateProductAsync(ProductInput input, CancellationToken ct = default)
    {
        Validate(input);
        var sku = string.IsNullOrWhiteSpace(input.Sku) ? await GenerateSkuAsync(ct) : input.Sku.Trim().ToUpperInvariant();
        await EnsureSkuAvailableAsync(sku, null, ct);

        var product = new Product
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            Name = input.Name.Trim(),
            Slug = await UniqueSlugAsync(input.Name, null, ct),
            Sku = sku,
            ShortDescription = input.ShortDescription?.Trim(),
            Description = input.Description?.Trim(),
            CategoryId = input.CategoryId,
            BrandId = input.BrandId,
            Status = input.Status,
            CostPrice = input.CostPrice,
            BasePrice = input.BasePrice,
            CompareAtPrice = input.CompareAtPrice,
            TaxRate = input.TaxRate,
            IsFeatured = input.IsFeatured,
            Tags = input.Tags,
            SeoTitle = input.SeoTitle,
            SeoDescription = input.SeoDescription,
            CurrencyCode = await CurrencyAsync(ct)
        };
        _db.Products.Add(product);

        var variantInputs = input.Variants is { Count: > 0 }
            ? input.Variants
            : [new VariantInput(null, "Default", sku, null, input.CostPrice, input.BasePrice, true, true)];

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var index = 0;
        foreach (var v in variantInputs)
        {
            var variantSku = string.IsNullOrWhiteSpace(v.Sku) ? sku : v.Sku.Trim().ToUpperInvariant();
            if (!seen.Add(variantSku))
                throw new DomainException(DomainErrors.Conflict, $"Duplicate variant SKU '{variantSku}'.");
            if (variantSku != sku) await EnsureSkuAvailableAsync(variantSku, product.Id, ct);
            _db.ProductVariants.Add(new ProductVariant
            {
                TenantId = _db.CurrentTenantId,
                WorkspaceId = _db.CurrentWorkspaceId,
                ProductId = product.Id,
                Name = string.IsNullOrWhiteSpace(v.Name) ? $"Variant {index + 1}" : v.Name.Trim(),
                Sku = variantSku,
                AttributesJson = v.AttributesJson,
                CostPrice = v.CostPrice,
                Price = v.Price,
                IsActive = v.IsActive,
                IsDefault = v.IsDefault || index == 0,
                SortOrder = index++
            });
        }

        if (input.Images is { Count: > 0 })
        {
            var sort = 0;
            foreach (var url in input.Images.Where(u => !string.IsNullOrWhiteSpace(u)))
                _db.ProductImages.Add(new ProductImage
                {
                    TenantId = _db.CurrentTenantId,
                    WorkspaceId = _db.CurrentWorkspaceId,
                    ProductId = product.Id,
                    Url = url.Trim(),
                    SortOrder = sort++
                });
        }

        _audit.Record("product.created", "Product", product.Id.ToString(), product.Name);
        _outbox.Enqueue("commerce.product.created", product.Id.ToString(), new
        {
            productId = product.Id,
            name = product.Name,
            sku = product.Sku,
            status = product.Status.ToString(),
            basePrice = product.BasePrice,
            currency = product.CurrencyCode
        });
        await _db.SaveChangesAsync(ct);

        return await GetProductAsync(product.Id, ct);
    }

    public async Task<ProductView> UpdateProductAsync(Guid id, ProductInput input, CancellationToken ct = default)
    {
        Validate(input);
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product not found.");

        var oldSku = product.Sku;
        if (!string.IsNullOrWhiteSpace(input.Sku))
        {
            var newSku = input.Sku.Trim().ToUpperInvariant();
            if (newSku != oldSku)
            {
                await EnsureSkuAvailableAsync(newSku, product.Id, ct);
                product.Sku = newSku;
            }
        }

        product.Name = input.Name.Trim();
        product.ShortDescription = input.ShortDescription?.Trim();
        product.Description = input.Description?.Trim();
        product.CategoryId = input.CategoryId;
        product.BrandId = input.BrandId;
        product.Status = input.Status;
        product.CostPrice = input.CostPrice;
        product.BasePrice = input.BasePrice;
        product.CompareAtPrice = input.CompareAtPrice;
        product.TaxRate = input.TaxRate;
        product.IsFeatured = input.IsFeatured;
        product.Tags = input.Tags;
        product.SeoTitle = input.SeoTitle;
        product.SeoDescription = input.SeoDescription;

        var existing = await _db.ProductVariants.Where(v => v.ProductId == id).ToListAsync(ct);
        var inputVariants = input.Variants ?? [];
        var keptIds = new HashSet<Guid>();
        var priceChanges = new List<PriceChange>();
        var index = 0;

        foreach (var v in inputVariants)
        {
            var variantSku = string.IsNullOrWhiteSpace(v.Sku)
                ? product.Sku + (index == 0 ? "" : $"-{index + 1}")
                : v.Sku.Trim().ToUpperInvariant();

            if (v.Id is not null && existing.FirstOrDefault(x => x.Id == v.Id) is { } current)
            {
                keptIds.Add(current.Id);
                await EnsureVariantSkuAvailableAsync(variantSku, product.Id, current.Id, ct);
                if (current.Price != v.Price)
                    priceChanges.Add(new PriceChange
                    {
                        TenantId = _db.CurrentTenantId,
                        WorkspaceId = _db.CurrentWorkspaceId,
                        VariantId = current.Id,
                        OldPrice = current.Price,
                        NewPrice = v.Price,
                        Reason = "Product update",
                        ChangedByUserId = _db.CurrentTenantId == Guid.Empty ? null : null
                    });
                current.Name = v.Name;
                current.Sku = variantSku;
                current.AttributesJson = v.AttributesJson;
                current.CostPrice = v.CostPrice;
                current.Price = v.Price;
                current.IsActive = v.IsActive;
                current.IsDefault = v.IsDefault || index == 0;
                current.SortOrder = index++;
            }
            else
            {
                await EnsureVariantSkuAvailableAsync(variantSku, product.Id, null, ct);
                _db.ProductVariants.Add(new ProductVariant
                {
                    TenantId = _db.CurrentTenantId,
                    WorkspaceId = _db.CurrentWorkspaceId,
                    ProductId = product.Id,
                    Name = string.IsNullOrWhiteSpace(v.Name) ? "Default" : v.Name,
                    Sku = variantSku,
                    AttributesJson = v.AttributesJson,
                    CostPrice = v.CostPrice,
                    Price = v.Price,
                    IsActive = v.IsActive,
                    IsDefault = v.IsDefault || index == 0,
                    SortOrder = index++
                });
            }
        }

        foreach (var stale in existing.Where(x => !keptIds.Contains(x.Id) && inputVariants.Any()))
        {
            // Archive variants that were removed from the form instead of destroying stock history.
            stale.IsActive = false;
            stale.IsDefault = false;
        }

        if (input.Images is not null)
        {
            var currentImages = await _db.ProductImages.Where(i => i.ProductId == id).ToListAsync(ct);
            _db.ProductImages.RemoveRange(currentImages);
            var sort = 0;
            foreach (var url in input.Images.Where(u => !string.IsNullOrWhiteSpace(u)))
                _db.ProductImages.Add(new ProductImage
                {
                    TenantId = _db.CurrentTenantId,
                    WorkspaceId = _db.CurrentWorkspaceId,
                    ProductId = id,
                    Url = url.Trim(),
                    SortOrder = sort++
                });
        }

        _db.PriceChanges.AddRange(priceChanges);
        _audit.Record("product.updated", "Product", product.Id.ToString(), product.Name);
        _outbox.Enqueue("commerce.product.updated", product.Id.ToString(), new
        {
            productId = product.Id,
            name = product.Name,
            sku = product.Sku,
            status = product.Status.ToString(),
            basePrice = product.BasePrice
        });
        foreach (var change in priceChanges)
            _outbox.Enqueue("commerce.price.changed", change.VariantId.ToString(), new
            {
                variantId = change.VariantId,
                oldPrice = change.OldPrice,
                newPrice = change.NewPrice,
                currency = product.CurrencyCode
            });

        await _db.SaveChangesAsync(ct);
        return await GetProductAsync(id, ct);
    }

    public async Task DeleteProductAsync(Guid id, CancellationToken ct = default)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product not found.");

        product.IsDeleted = true;
        product.Status = ProductStatus.Archived;
        var variants = await _db.ProductVariants.Where(v => v.ProductId == id).ToListAsync(ct);
        foreach (var variant in variants) variant.IsActive = false;

        _audit.Record("product.deleted", "Product", product.Id.ToString(), product.Name);
        _outbox.Enqueue("commerce.product.updated", product.Id.ToString(), new { productId = product.Id, status = "ARCHIVED" });
        await _db.SaveChangesAsync(ct);
    }

    // ---------------- Categories ----------------

    public async Task<IReadOnlyList<CategoryView>> ListCategoriesAsync(CancellationToken ct = default)
    {
        var categories = await _db.Categories.AsNoTracking().OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync(ct);
        var counts = await _db.Products.AsNoTracking().Where(p => !p.IsDeleted && p.CategoryId != null)
            .GroupBy(p => p.CategoryId!.Value).Select(g => new { CategoryId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CategoryId, x => x.Count, ct);
        return categories.Select(c => new CategoryView(c.Id, c.Name, c.Slug, c.ParentId, c.Description,
            c.IsActive, c.SortOrder, counts.GetValueOrDefault(c.Id))).ToList();
    }

    public async Task<CategoryView> CreateCategoryAsync(CategoryInput input, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(input.Name))
            throw new DomainException(DomainErrors.Validation, "Category name is required.");
        if (input.ParentId is not null && !await _db.Categories.AnyAsync(c => c.Id == input.ParentId, ct))
            throw new DomainException(DomainErrors.Validation, "Parent category not found.");

        var category = new Category
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            Name = input.Name.Trim(),
            Slug = await UniqueCategorySlugAsync(input.Name, null, ct),
            ParentId = input.ParentId,
            Description = input.Description?.Trim(),
            IsActive = input.IsActive,
            SortOrder = input.SortOrder
        };
        _db.Categories.Add(category);
        _audit.Record("category.created", "Category", category.Id.ToString(), category.Name);
        await _db.SaveChangesAsync(ct);
        return new CategoryView(category.Id, category.Name, category.Slug, category.ParentId,
            category.Description, category.IsActive, category.SortOrder, 0);
    }

    public async Task<CategoryView> UpdateCategoryAsync(Guid id, CategoryInput input, CancellationToken ct = default)
    {
        var category = await _db.Categories.FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Category not found.");
        if (input.ParentId == id)
            throw new DomainException(DomainErrors.Validation, "A category cannot be its own parent.");
        if (string.IsNullOrWhiteSpace(input.Name))
            throw new DomainException(DomainErrors.Validation, "Category name is required.");

        category.Name = input.Name.Trim();
        category.ParentId = input.ParentId;
        category.Description = input.Description?.Trim();
        category.IsActive = input.IsActive;
        category.SortOrder = input.SortOrder;
        await _db.SaveChangesAsync(ct);
        var count = await _db.Products.CountAsync(p => p.CategoryId == id && !p.IsDeleted, ct);
        return new CategoryView(category.Id, category.Name, category.Slug, category.ParentId,
            category.Description, category.IsActive, category.SortOrder, count);
    }

    public async Task DeleteCategoryAsync(Guid id, CancellationToken ct = default)
    {
        var category = await _db.Categories.FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Category not found.");
        if (await _db.Products.AnyAsync(p => p.CategoryId == id && !p.IsDeleted, ct))
            throw new DomainException(DomainErrors.Conflict, "Move or delete the products in this category first.");
        if (await _db.Categories.AnyAsync(c => c.ParentId == id, ct))
            throw new DomainException(DomainErrors.Conflict, "Move or delete child categories first.");
        _db.Categories.Remove(category);
        await _db.SaveChangesAsync(ct);
    }

    // ---------------- Brands ----------------

    public async Task<IReadOnlyList<BrandView>> ListBrandsAsync(CancellationToken ct = default)
    {
        var brands = await _db.Brands.AsNoTracking().OrderBy(b => b.Name).ToListAsync(ct);
        var counts = await _db.Products.AsNoTracking().Where(p => !p.IsDeleted && p.BrandId != null)
            .GroupBy(p => p.BrandId!.Value).Select(g => new { BrandId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.BrandId, x => x.Count, ct);
        return brands.Select(b => new BrandView(b.Id, b.Name, b.Slug, b.LogoUrl, counts.GetValueOrDefault(b.Id))).ToList();
    }

    public async Task<BrandView> CreateBrandAsync(BrandInput input, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(input.Name))
            throw new DomainException(DomainErrors.Validation, "Brand name is required.");
        var brand = new Brand
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            Name = input.Name.Trim(),
            Slug = await UniqueBrandSlugAsync(input.Name, null, ct),
            LogoUrl = input.LogoUrl?.Trim()
        };
        _db.Brands.Add(brand);
        _audit.Record("brand.created", "Brand", brand.Id.ToString(), brand.Name);
        await _db.SaveChangesAsync(ct);
        return new BrandView(brand.Id, brand.Name, brand.Slug, brand.LogoUrl, 0);
    }

    public async Task<BrandView> UpdateBrandAsync(Guid id, BrandInput input, CancellationToken ct = default)
    {
        var brand = await _db.Brands.FirstOrDefaultAsync(b => b.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Brand not found.");
        if (!string.IsNullOrWhiteSpace(input.Name)) brand.Name = input.Name.Trim();
        brand.LogoUrl = input.LogoUrl?.Trim();
        await _db.SaveChangesAsync(ct);
        var count = await _db.Products.CountAsync(p => p.BrandId == id && !p.IsDeleted, ct);
        return new BrandView(brand.Id, brand.Name, brand.Slug, brand.LogoUrl, count);
    }

    public async Task DeleteBrandAsync(Guid id, CancellationToken ct = default)
    {
        var brand = await _db.Brands.FirstOrDefaultAsync(b => b.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Brand not found.");
        if (await _db.Products.AnyAsync(p => p.BrandId == id && !p.IsDeleted, ct))
            throw new DomainException(DomainErrors.Conflict, "Remove this brand from its products first.");
        _db.Brands.Remove(brand);
        await _db.SaveChangesAsync(ct);
    }

    // ---------------- Import / export ----------------

    public async Task<string> ExportProductsCsvAsync(CancellationToken ct = default)
    {
        var products = await _db.Products.AsNoTracking().Where(p => !p.IsDeleted).OrderBy(p => p.Name).ToListAsync(ct);
        var categories = await _db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name, ct);
        var brands = await _db.Brands.AsNoTracking().ToDictionaryAsync(b => b.Id, b => b.Name, ct);
        var variants = await _db.ProductVariants.AsNoTracking().ToDictionaryAsync(v => v.Id, v => v.ProductId, ct);
        var stock = await _db.StockItems.AsNoTracking()
            .GroupBy(s => s.VariantId)
            .Select(g => new { VariantId = g.Key, OnHand = g.Sum(s => s.QuantityOnHand) })
            .ToDictionaryAsync(x => x.VariantId, x => x.OnHand, ct);

        var sb = new StringBuilder();
        sb.AppendLine("SKU,Name,Category,Brand,SellingPrice,CostPrice,Stock,Status,Description");
        foreach (var p in products)
        {
            var stockQty = variants.Where(v => v.Value == p.Id).Sum(v => stock.GetValueOrDefault(v.Key));
            sb.AppendLine(string.Join(",",
                Csv(p.Sku), Csv(p.Name),
                Csv(p.CategoryId is not null ? categories.GetValueOrDefault(p.CategoryId.Value) : ""),
                Csv(p.BrandId is not null ? brands.GetValueOrDefault(p.BrandId.Value) : ""),
                p.BasePrice.ToString("0.00"), p.CostPrice.ToString("0.00"),
                stockQty, p.Status, Csv(p.ShortDescription ?? "")));
        }
        return sb.ToString();
    }

    public async Task<CsvImportResult> ImportProductsCsvAsync(Stream stream, CancellationToken ct = default)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, true, leaveOpen: true);
        var content = await reader.ReadToEndAsync(ct);
        var lines = content.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length < 2)
            throw new DomainException(DomainErrors.Validation, "CSV must contain a header row and at least one product row.");

        var header = ParseCsvLine(lines[0].TrimEnd('\r')).Select(h => h.Trim().ToLowerInvariant()).ToList();
        int Col(params string[] names) => header.FindIndex(h => names.Contains(h));
        var skuCol = Col("sku");
        var nameCol = Col("name", "product name");
        var priceCol = Col("sellingprice", "price", "selling price");
        var costCol = Col("costprice", "cost", "cost price");
        var stockCol = Col("stock", "quantity", "qty");
        var categoryCol = Col("category");
        var brandCol = Col("brand");
        var statusCol = Col("status");
        var descriptionCol = Col("description");

        if (skuCol < 0 || nameCol < 0 || priceCol < 0)
            throw new DomainException(DomainErrors.Validation, "CSV must include SKU, Name and SellingPrice columns.");

        var defaultWarehouse = await _db.Warehouses.FirstOrDefaultAsync(w => w.IsDefault, ct)
            ?? await _db.Warehouses.FirstOrDefaultAsync(ct);
        int created = 0, updated = 0, skipped = 0;
        var errors = new List<string>();
        var row = 0;

        foreach (var raw in lines.Skip(1))
        {
            row++;
            var line = raw.TrimEnd('\r');
            if (string.IsNullOrWhiteSpace(line)) continue;
            var cells = ParseCsvLine(line);
            string Cell(int index) => index >= 0 && index < cells.Count ? cells[index].Trim() : "";

            var sku = Cell(skuCol).ToUpperInvariant();
            var name = Cell(nameCol);
            if (string.IsNullOrEmpty(sku) || string.IsNullOrEmpty(name))
            {
                skipped++;
                errors.Add($"Row {row + 1}: SKU and Name are required.");
                continue;
            }
            if (!decimal.TryParse(Cell(priceCol), out var price) || price < 0)
            {
                skipped++;
                errors.Add($"Row {row + 1}: SellingPrice is invalid.");
                continue;
            }
            decimal.TryParse(Cell(costCol), out var cost);
            int.TryParse(Cell(stockCol), out var stock);
            Enum.TryParse<ProductStatus>(Cell(statusCol), true, out var status);

            var product = await _db.Products.FirstOrDefaultAsync(p => p.Sku == sku && !p.IsDeleted, ct);
            Guid? categoryId = null;
            if (!string.IsNullOrWhiteSpace(Cell(categoryCol)))
            {
                var categoryName = Cell(categoryCol);
                var category = await _db.Categories.FirstOrDefaultAsync(c => c.Name == categoryName, ct);
                if (category is null)
                {
                    category = new Category
                    {
                        TenantId = _db.CurrentTenantId,
                        WorkspaceId = _db.CurrentWorkspaceId,
                        Name = categoryName,
                        Slug = await UniqueCategorySlugAsync(categoryName, null, ct)
                    };
                    _db.Categories.Add(category);
                }
                categoryId = category.Id;
            }
            Guid? brandId = null;
            if (!string.IsNullOrWhiteSpace(Cell(brandCol)))
            {
                var brandName = Cell(brandCol);
                var brand = await _db.Brands.FirstOrDefaultAsync(b => b.Name == brandName, ct);
                if (brand is null)
                {
                    brand = new Brand
                    {
                        TenantId = _db.CurrentTenantId,
                        WorkspaceId = _db.CurrentWorkspaceId,
                        Name = brandName,
                        Slug = await UniqueBrandSlugAsync(brandName, null, ct)
                    };
                    _db.Brands.Add(brand);
                }
                brandId = brand.Id;
            }

            ProductVariant? variant;
            if (product is null)
            {
                product = new Product
                {
                    TenantId = _db.CurrentTenantId,
                    WorkspaceId = _db.CurrentWorkspaceId,
                    Name = name,
                    Slug = await UniqueSlugAsync(name, null, ct),
                    Sku = sku,
                    CategoryId = categoryId,
                    BrandId = brandId,
                    Status = status,
                    BasePrice = price,
                    CostPrice = cost,
                    ShortDescription = Cell(descriptionCol),
                    Description = Cell(descriptionCol),
                    CurrencyCode = await CurrencyAsync(ct)
                };
                _db.Products.Add(product);
                variant = new ProductVariant
                {
                    TenantId = _db.CurrentTenantId,
                    WorkspaceId = _db.CurrentWorkspaceId,
                    ProductId = product.Id,
                    Name = "Default",
                    Sku = sku,
                    Price = price,
                    CostPrice = cost,
                    IsDefault = true
                };
                _db.ProductVariants.Add(variant);
                created++;
            }
            else
            {
                product.Name = name;
                product.BasePrice = price;
                product.CostPrice = cost;
                if (categoryId is not null) product.CategoryId = categoryId;
                if (brandId is not null) product.BrandId = brandId;
                if (!string.IsNullOrWhiteSpace(Cell(statusCol))) product.Status = status;
                if (!string.IsNullOrWhiteSpace(Cell(descriptionCol))) product.ShortDescription = Cell(descriptionCol);
                variant = await _db.ProductVariants.FirstOrDefaultAsync(v => v.ProductId == product.Id && v.IsDefault, ct)
                    ?? await _db.ProductVariants.FirstOrDefaultAsync(v => v.ProductId == product.Id, ct);
                if (variant is not null)
                {
                    variant.Price = price;
                    variant.CostPrice = cost;
                }
                updated++;
            }

            if (variant is not null && stockCol >= 0 && defaultWarehouse is not null)
            {
                var stockItem = await _db.StockItems.FirstOrDefaultAsync(s => s.WarehouseId == defaultWarehouse.Id && s.VariantId == variant.Id, ct);
                if (stockItem is null)
                {
                    stockItem = new StockItem
                    {
                        TenantId = _db.CurrentTenantId,
                        WorkspaceId = _db.CurrentWorkspaceId,
                        WarehouseId = defaultWarehouse.Id,
                        VariantId = variant.Id,
                        QuantityOnHand = Math.Max(0, stock),
                        ReorderPoint = 8,
                        ReorderQuantity = 20
                    };
                    _db.StockItems.Add(stockItem);
                }
                else if (stockItem.QuantityOnHand != stock)
                {
                    stockItem.QuantityOnHand = Math.Max(0, stock);
                }
            }
        }

        await _db.SaveChangesAsync(ct);
        _outbox.Enqueue("commerce.product.updated", Guid.NewGuid().ToString(), new { source = "csv-import", created, updated });
        await _db.SaveChangesAsync(ct);
        return new CsvImportResult(created, updated, skipped, errors.Take(50).ToList());
    }

    // ---------------- helpers ----------------

    private async Task<ProductView> BuildViewAsync(Product p, CancellationToken ct)
    {
        var variants = await _db.ProductVariants.AsNoTracking().Where(v => v.ProductId == p.Id)
            .OrderBy(v => v.SortOrder).ToListAsync(ct);
        var variantIds = variants.Select(v => v.Id).ToList();
        var stock = await _db.StockItems.AsNoTracking().Where(s => variantIds.Contains(s.VariantId)).ToListAsync(ct);
        var category = p.CategoryId is null ? null : await _db.Categories.AsNoTracking().FirstOrDefaultAsync(c => c.Id == p.CategoryId, ct);
        var brand = p.BrandId is null ? null : await _db.Brands.AsNoTracking().FirstOrDefaultAsync(b => b.Id == p.BrandId, ct);
        var images = await _db.ProductImages.AsNoTracking().Where(i => i.ProductId == p.Id)
            .OrderBy(i => i.SortOrder).Select(i => i.Url).ToListAsync(ct);

        var variantViews = variants.Select(v => new VariantView(v.Id, v.Name, v.Sku, v.AttributesJson,
            v.Price, v.CostPrice, v.IsActive, v.IsDefault,
            stock.Where(s => s.VariantId == v.Id).Sum(s => s.QuantityOnHand),
            stock.Where(s => s.VariantId == v.Id).Sum(s => s.QuantityReserved))).ToList();

        return new ProductView(p.Id, p.Name, p.Slug, p.Sku, p.ShortDescription, p.Description,
            p.CategoryId, category?.Name, p.BrandId, brand?.Name, p.Status, p.CostPrice, p.BasePrice,
            p.CompareAtPrice, p.TaxRate, p.CurrencyCode, p.IsFeatured, p.Tags, p.SeoTitle, p.SeoDescription,
            variantViews, images, variantViews.Sum(v => v.OnHand), variantViews.Sum(v => v.Reserved));
    }

    private static void Validate(ProductInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name))
            throw new DomainException(DomainErrors.Validation, "Product name is required.");
        if (input.BasePrice < 0 || input.CostPrice < 0)
            throw new DomainException(DomainErrors.Validation, "Prices cannot be negative.");
        if (input.TaxRate < 0)
            throw new DomainException(DomainErrors.Validation, "Tax rate cannot be negative.");
        if (input.CompareAtPrice is not null && input.CompareAtPrice < 0)
            throw new DomainException(DomainErrors.Validation, "Compare-at price cannot be negative.");
        foreach (var v in input.Variants ?? [])
        {
            if (v.Price < 0 || v.CostPrice < 0)
                throw new DomainException(DomainErrors.Validation, "Variant prices cannot be negative.");
        }
    }

    private async Task EnsureSkuAvailableAsync(string sku, Guid? productId, CancellationToken ct)
    {
        var exists = await _db.Products.AnyAsync(p => p.Sku == sku && p.Id != productId, ct);
        if (exists) throw new DomainException(DomainErrors.Conflict, $"SKU '{sku}' is already used by another product.");
        var variantExists = await _db.ProductVariants.AnyAsync(v => v.Sku == sku && v.ProductId != productId, ct);
        if (variantExists) throw new DomainException(DomainErrors.Conflict, $"SKU '{sku}' is already used by a variant.");
    }

    private async Task EnsureVariantSkuAvailableAsync(string sku, Guid productId, Guid? variantId, CancellationToken ct)
    {
        var duplicateVariant = await _db.ProductVariants.AnyAsync(v => v.Sku == sku && v.ProductId != productId && v.Id != variantId, ct);
        if (duplicateVariant) throw new DomainException(DomainErrors.Conflict, $"SKU '{sku}' is already used by another variant.");
        var otherProduct = await _db.Products.AnyAsync(p => p.Sku == sku && p.Id != productId, ct);
        if (otherProduct) throw new DomainException(DomainErrors.Conflict, $"SKU '{sku}' is already used by another product.");
    }

    private async Task<string> GenerateSkuAsync(CancellationToken ct)
    {
        for (var i = 0; i < 20; i++)
        {
            var sku = $"SKU-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";
            if (!await _db.Products.AnyAsync(p => p.Sku == sku, ct)) return sku;
        }
        throw new DomainException(DomainErrors.Conflict, "Could not generate a unique SKU.");
    }

    private async Task<string> UniqueSlugAsync(string name, Guid? excludeId, CancellationToken ct)
    {
        var baseSlug = Regex.Replace(name.Trim().ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        if (string.IsNullOrEmpty(baseSlug)) baseSlug = "product";
        var slug = baseSlug;
        var i = 1;
        while (await _db.Products.AnyAsync(p => p.Slug == slug && p.Id != excludeId, ct))
            slug = $"{baseSlug}-{++i}";
        return slug;
    }

    private async Task<string> UniqueCategorySlugAsync(string name, Guid? excludeId, CancellationToken ct)
    {
        var baseSlug = Regex.Replace(name.Trim().ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        if (string.IsNullOrEmpty(baseSlug)) baseSlug = "category";
        var slug = baseSlug;
        var i = 1;
        while (await _db.Categories.AnyAsync(c => c.Slug == slug && c.Id != excludeId, ct))
            slug = $"{baseSlug}-{++i}";
        return slug;
    }

    private async Task<string> UniqueBrandSlugAsync(string name, Guid? excludeId, CancellationToken ct)
    {
        var baseSlug = Regex.Replace(name.Trim().ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        if (string.IsNullOrEmpty(baseSlug)) baseSlug = "brand";
        var slug = baseSlug;
        var i = 1;
        while (await _db.Brands.AnyAsync(b => b.Slug == slug && b.Id != excludeId, ct))
            slug = $"{baseSlug}-{++i}";
        return slug;
    }

    private async Task<string> CurrencyAsync(CancellationToken ct) =>
        (await _db.Workspaces.AsNoTracking().FirstAsync(w => w.Id == _db.CurrentWorkspaceId, ct)).CurrencyCode;

    private static string Csv(string value)
    {
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n'))
            return $"\"{value.Replace("\"", "\"\"")}\"";
        return value;
    }

    internal static List<string> ParseCsvLine(string line)
    {
        var result = new List<string>();
        var current = new StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < line.Length; i++)
        {
            var ch = line[i];
            if (inQuotes)
            {
                if (ch == '"' && i + 1 < line.Length && line[i + 1] == '"')
                {
                    current.Append('"');
                    i++;
                }
                else if (ch == '"') inQuotes = false;
                else current.Append(ch);
            }
            else if (ch == '"') inQuotes = true;
            else if (ch == ',')
            {
                result.Add(current.ToString());
                current.Clear();
            }
            else current.Append(ch);
        }
        result.Add(current.ToString());
        return result;
    }
}
