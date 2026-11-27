using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Integrations;
using Commerce.Domain.Inventory;
using Commerce.Domain.Orders;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Integrations;

public sealed record IntegrationProductSummary(Guid Id, string Name, string Sku, string? ShortDescription,
    string? Category, string? Brand, decimal Price, decimal? CompareAtPrice, string CurrencyCode, int Available,
    bool InStock, string? ImageUrl, string Status);

public sealed record IntegrationVariant(Guid Id, string Name, string Sku, string? AttributesJson,
    decimal EffectivePrice, decimal ListPrice, int Available, bool IsActive);

public sealed record IntegrationProductDetail(Guid Id, string Name, string Sku, string? ShortDescription,
    string? Description, string? Category, string? Brand, string Status, decimal EffectivePrice,
    decimal? CompareAtPrice, string CurrencyCode, bool InStock, IReadOnlyList<IntegrationVariant> Variants,
    IReadOnlyList<string> Images, IReadOnlyList<IntegrationOffer> ActiveOffers, DateTime CheckedAtUtc);

public sealed record WarehouseAvailability(Guid WarehouseId, string WarehouseName, int OnHand, int Reserved, int Available);
public sealed record IntegrationAvailability(Guid ProductId, string Sku, int Available, bool InStock,
    IReadOnlyList<WarehouseAvailability> Warehouses, DateTime CheckedAtUtc);

public sealed record IntegrationPricing(Guid ProductId, string Sku, string CurrencyCode,
    IReadOnlyList<IntegrationVariant> Variants, decimal? CouponDiscount, string? CouponCode,
    DateTime CheckedAtUtc);

public sealed record IntegrationOffer(Guid Id, string Name, string Type, decimal Value, DateTime StartsAtUtc,
    DateTime EndsAtUtc, string? AppliesTo, string? ProductId, string? CategoryId);

public sealed record IntegrationCustomerSummary(Guid Id, string DisplayName, string? Email, string? Phone,
    string? CompanyName, bool IsBusiness, string? Tags, int OrderCount, decimal TotalSpent,
    DateTime? LastOrderAtUtc, string? ExternalSource, string? ExternalId);

public sealed record IntegrationAddress(string Type, string Line1, string? Line2, string City, string? State,
    string? PostalCode, string Country);

public sealed record IntegrationCustomerDetail(Guid Id, string DisplayName, string? Email, string? Phone,
    string? CompanyName, bool IsBusiness, string? Tags, IReadOnlyList<IntegrationAddress> Addresses,
    int OrderCount, decimal TotalSpent, string? ExternalSource, string? ExternalId);

public sealed record IntegrationOrderItem(string ProductName, string Sku, int Quantity, decimal UnitPrice,
    decimal LineTotal);

public sealed record IntegrationOrder(Guid Id, string OrderNumber, string CustomerName, string Status,
    string PaymentStatus, string FulfillmentStatus, decimal GrandTotal, decimal PaidTotal, string CurrencyCode,
    DateTime PlacedAtUtc, DateTime? ShippedAtUtc, DateTime? DeliveredAtUtc,
    IReadOnlyList<IntegrationOrderItem>? Items = null, string? InvoiceNumber = null);

public sealed record IntegrationOrderStatus(Guid Id, string OrderNumber, string Status, string PaymentStatus,
    string FulfillmentStatus, DateTime? ShippedAtUtc, DateTime? DeliveredAtUtc, DateTime CheckedAtUtc);

public sealed class IntegrationQueryService
{
    private readonly CommerceDbContext _db;

    public IntegrationQueryService(CommerceDbContext db) => _db = db;

    public async Task<(PagedResult<IntegrationProductSummary> Result, IReadOnlyList<IntegrationOffer> Offers)> SearchProductsAsync(
        string? search, string? sku, Guid? categoryId, int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = _db.Products.AsNoTracking()
            .Where(p => !p.IsDeleted && p.Status == ProductStatus.Active);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(p => p.Name.ToLower().Contains(term) || p.Sku.ToLower().Contains(term)
                || (p.Tags != null && p.Tags.ToLower().Contains(term))
                || (p.ShortDescription != null && p.ShortDescription.ToLower().Contains(term)));
        }
        if (!string.IsNullOrWhiteSpace(sku))
        {
            var s = sku.Trim().ToUpper();
            query = query.Where(p => p.Sku.ToUpper() == s);
        }
        if (categoryId is not null) query = query.Where(p => p.CategoryId == categoryId);

        var total = await query.CountAsync(ct);
        var products = await query.OrderBy(p => p.Name).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var productIds = products.Select(p => p.Id).ToList();
        var variants = await _db.ProductVariants.AsNoTracking().Where(v => productIds.Contains(v.ProductId)).ToListAsync(ct);
        var offers = await ActiveOffersAsync(ct);
        var categories = await _db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name, ct);
        var brands = await _db.Brands.AsNoTracking().ToDictionaryAsync(b => b.Id, b => b.Name, ct);
        var stock = await LoadStockAsync(variants.Select(v => v.Id).ToList(), ct);
        var images = await _db.ProductImages.AsNoTracking().Where(i => productIds.Contains(i.ProductId))
            .OrderBy(i => i.SortOrder).ToListAsync(ct);

        var items = products.Select(p =>
        {
            var defaultVariant = variants.FirstOrDefault(v => v.ProductId == p.Id && v.IsDefault)
                ?? variants.FirstOrDefault(v => v.ProductId == p.Id);
            var price = defaultVariant is null ? p.BasePrice : EffectivePrice(p, defaultVariant.Price, 1, offers);
            var available = variants.Where(v => v.ProductId == p.Id).Sum(v =>
                stock.Where(s => s.VariantId == v.Id).Sum(s => s.QuantityOnHand - s.QuantityReserved));
            return new IntegrationProductSummary(p.Id, p.Name, p.Sku, p.ShortDescription,
                p.CategoryId is not null ? categories.GetValueOrDefault(p.CategoryId.Value) : null,
                p.BrandId is not null ? brands.GetValueOrDefault(p.BrandId.Value) : null,
                price, p.CompareAtPrice, p.CurrencyCode, Math.Max(0, available), available > 0,
                images.FirstOrDefault(i => i.ProductId == p.Id)?.Url, p.Status.ToString());
        }).ToList();

        return (new PagedResult<IntegrationProductSummary>(items, page, pageSize, total), offers);
    }

    public async Task<IntegrationProductDetail> GetProductAsync(Guid id, int quantity = 1, CancellationToken ct = default)
    {
        var p = await _db.Products.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product not found.");
        if (p.Status != ProductStatus.Active)
            throw new DomainException(DomainErrors.NotFound, "Product not found.");

        var variants = await _db.ProductVariants.AsNoTracking().Where(v => v.ProductId == id).ToListAsync(ct);
        var stock = await LoadStockAsync(variants.Select(v => v.Id).ToList(), ct);
        var offers = await ActiveOffersAsync(ct);
        var category = p.CategoryId is null ? null : (await _db.Categories.AsNoTracking().FirstOrDefaultAsync(c => c.Id == p.CategoryId, ct))?.Name;
        var brand = p.BrandId is null ? null : (await _db.Brands.AsNoTracking().FirstOrDefaultAsync(b => b.Id == p.BrandId, ct))?.Name;
        var images = await _db.ProductImages.AsNoTracking().Where(i => i.ProductId == id)
            .OrderBy(i => i.SortOrder).Select(i => i.Url).ToListAsync(ct);

        var variantViews = variants.Select(v =>
        {
            var available = stock.Where(s => s.VariantId == v.Id).Sum(s => s.QuantityOnHand - s.QuantityReserved);
            return new IntegrationVariant(v.Id, v.Name, v.Sku, v.AttributesJson,
                EffectivePrice(p, v.Price, quantity, offers), v.Price, Math.Max(0, available), v.IsActive);
        }).ToList();

        var applicableOffers = offers.Where(o => OfferApplies(o, p)).ToList();
        var effective = variantViews.FirstOrDefault(v => v.IsActive)?.EffectivePrice ?? p.BasePrice;

        return new IntegrationProductDetail(p.Id, p.Name, p.Sku, p.ShortDescription, p.Description,
            category, brand, p.Status.ToString(), effective, p.CompareAtPrice, p.CurrencyCode,
            variantViews.Any(v => v.Available > 0), variantViews, images, applicableOffers, DateTime.UtcNow);
    }

    public async Task<IntegrationAvailability> GetAvailabilityAsync(Guid productId, CancellationToken ct = default)
    {
        var product = await _db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == productId && !p.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product not found.");
        var variants = await _db.ProductVariants.AsNoTracking().Where(v => v.ProductId == productId).ToListAsync(ct);
        var ids = variants.Select(v => v.Id).ToList();
        var stock = await _db.StockItems.AsNoTracking().Where(s => ids.Contains(s.VariantId)).ToListAsync(ct);
        var warehouses = await _db.Warehouses.AsNoTracking().Where(w => w.IsActive).ToDictionaryAsync(w => w.Id, w => w.Name, ct);

        var rows = warehouses.Select(w =>
        {
            var items = stock.Where(s => s.WarehouseId == w.Key).ToList();
            return new WarehouseAvailability(w.Key, w.Value, items.Sum(s => s.QuantityOnHand),
                items.Sum(s => s.QuantityReserved), items.Sum(s => s.QuantityOnHand - s.QuantityReserved));
        }).ToList();
        var available = Math.Max(0, rows.Sum(r => r.Available));

        return new IntegrationAvailability(product.Id, product.Sku, available, available > 0, rows, DateTime.UtcNow);
    }

    public async Task<IntegrationPricing> GetPricingAsync(Guid productId, int quantity, string? couponCode,
        CancellationToken ct = default)
    {
        if (quantity < 1) quantity = 1;
        var product = await _db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == productId && !p.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product not found.");
        var variants = await _db.ProductVariants.AsNoTracking().Where(v => v.ProductId == productId).ToListAsync(ct);
        var offers = await ActiveOffersAsync(ct);

        var views = variants.Select(v => new IntegrationVariant(v.Id, v.Name, v.Sku, v.AttributesJson,
            EffectivePrice(product, v.Price, quantity, offers), v.Price, 0, v.IsActive)).ToList();

        decimal? couponDiscount = null;
        string? normalizedCoupon = null;
        if (!string.IsNullOrWhiteSpace(couponCode))
        {
            var pricing = new PricingService(_db);
            var quote = await pricing.ValidateCouponAsync(couponCode, views.FirstOrDefault()?.EffectivePrice * quantity ?? 0, ct);
            couponDiscount = quote?.DiscountAmount;
            normalizedCoupon = quote?.Code;
        }

        return new IntegrationPricing(product.Id, product.Sku, product.CurrencyCode, views,
            couponDiscount, normalizedCoupon, DateTime.UtcNow);
    }

    public async Task<IReadOnlyList<IntegrationOffer>> GetActiveOffersAsync(CancellationToken ct = default) =>
        await ActiveOffersAsync(ct);

    public async Task<PagedResult<IntegrationCustomerSummary>> SearchCustomersAsync(string? search, int page,
        int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = _db.Customers.AsNoTracking().Where(c => !c.IsDeleted);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            // A phone is matched by its digits too, whatever separators it was typed with ("+880 1711-000 222").
            var digits = new string(term.Where(char.IsAsciiDigit).ToArray());
            var phoneDigits = digits.Length >= 6 && term.All(ch => char.IsAsciiDigit(ch) || " +-().".Contains(ch)) ? digits : null;
            query = query.Where(c => c.FirstName.ToLower().Contains(term) || c.LastName.ToLower().Contains(term)
                || (c.Email != null && c.Email.ToLower().Contains(term))
                || (c.Phone != null && c.Phone.Contains(term))
                || (phoneDigits != null && c.Phone != null && c.Phone.Replace(" ", "").Replace("-", "").Replace("(", "")
                    .Replace(")", "").Replace(".", "").Replace("+", "").Contains(phoneDigits))
                || (c.CompanyName != null && c.CompanyName.ToLower().Contains(term)));
        }
        var total = await query.CountAsync(ct);
        var customers = await query.OrderByDescending(c => c.CreatedAtUtc).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var ids = customers.Select(c => c.Id).ToList();
        var stats = await _db.Orders.AsNoTracking()
            .Where(o => o.CustomerId != null && ids.Contains(o.CustomerId.Value) && o.Status != OrderStatus.Cancelled)
            .GroupBy(o => o.CustomerId!.Value)
            .Select(g => new { CustomerId = g.Key, Count = g.Count(), Total = g.Sum(o => o.GrandTotal), Last = g.Max(o => (DateTime?)o.PlacedAtUtc) })
            .ToDictionaryAsync(x => x.CustomerId, ct);

        var items = customers.Select(c =>
        {
            var s = stats.GetValueOrDefault(c.Id);
            return new IntegrationCustomerSummary(c.Id, c.DisplayName, c.Email, c.Phone, c.CompanyName,
                c.IsBusiness, c.Tags, s?.Count ?? 0, s?.Total ?? 0m, s?.Last, c.ExternalSource, c.ExternalId);
        }).ToList();
        return new PagedResult<IntegrationCustomerSummary>(items, page, pageSize, total);
    }

    public async Task<IntegrationCustomerDetail> GetCustomerAsync(Guid id, CancellationToken ct = default)
    {
        var c = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Customer not found.");
        var addresses = await _db.CustomerAddresses.AsNoTracking().Where(a => a.CustomerId == id).ToListAsync(ct);
        var orders = await _db.Orders.AsNoTracking().Where(o => o.CustomerId == id && o.Status != OrderStatus.Cancelled).ToListAsync(ct);
        return new IntegrationCustomerDetail(c.Id, c.DisplayName, c.Email, c.Phone, c.CompanyName, c.IsBusiness,
            c.Tags, addresses.Select(a => new IntegrationAddress(a.Type, a.Line1, a.Line2, a.City, a.State, a.PostalCode, a.Country)).ToList(),
            orders.Count, orders.Sum(o => o.GrandTotal), c.ExternalSource, c.ExternalId);
    }

    public async Task<IReadOnlyList<IntegrationOrder>> GetCustomerOrdersAsync(Guid customerId, CancellationToken ct = default)
    {
        if (!await _db.Customers.AnyAsync(c => c.Id == customerId && !c.IsDeleted, ct))
            throw new DomainException(DomainErrors.NotFound, "Customer not found.");
        var orders = await _db.Orders.AsNoTracking().Where(o => o.CustomerId == customerId)
            .OrderByDescending(o => o.PlacedAtUtc).Take(100).ToListAsync(ct);
        return orders.Select(o => new IntegrationOrder(o.Id, o.OrderNumber, o.CustomerName, o.Status.ToString(),
            o.PaymentStatus.ToString(), o.FulfillmentStatus.ToString(), o.GrandTotal, o.PaidTotal, o.CurrencyCode,
            o.PlacedAtUtc, o.ShippedAtUtc, o.DeliveredAtUtc)).ToList();
    }

    public async Task<IntegrationOrder> GetOrderAsync(Guid id, CancellationToken ct = default)
    {
        var o = await _db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Order not found.");
        var items = await _db.OrderItems.AsNoTracking().Where(i => i.OrderId == id).ToListAsync(ct);
        var invoice = await _db.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.OrderId == id, ct);
        return new IntegrationOrder(o.Id, o.OrderNumber, o.CustomerName, o.Status.ToString(),
            o.PaymentStatus.ToString(), o.FulfillmentStatus.ToString(), o.GrandTotal, o.PaidTotal,
            o.CurrencyCode, o.PlacedAtUtc, o.ShippedAtUtc, o.DeliveredAtUtc,
            items.Select(i => new IntegrationOrderItem(i.ProductName, i.Sku, i.Quantity, i.UnitPrice, i.LineTotal)).ToList(),
            invoice?.InvoiceNumber);
    }

    public async Task<IntegrationOrderStatus> GetOrderStatusAsync(Guid id, CancellationToken ct = default)
    {
        var o = await _db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Order not found.");
        return new IntegrationOrderStatus(o.Id, o.OrderNumber, o.Status.ToString(), o.PaymentStatus.ToString(),
            o.FulfillmentStatus.ToString(), o.ShippedAtUtc, o.DeliveredAtUtc, DateTime.UtcNow);
    }

    private async Task<List<StockItem>> LoadStockAsync(List<Guid> variantIds, CancellationToken ct) =>
        await _db.StockItems.AsNoTracking().Where(s => variantIds.Contains(s.VariantId)).ToListAsync(ct);

    private async Task<List<IntegrationOffer>> ActiveOffersAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var offers = await _db.Offers.AsNoTracking()
            .Where(o => o.IsActive && o.StartsAtUtc <= now && o.EndsAtUtc >= now).ToListAsync(ct);
        var productIds = offers.Where(o => o.ProductId != null).Select(o => o.ProductId!.Value).Distinct().ToList();
        var categoryIds = offers.Where(o => o.CategoryId != null).Select(o => o.CategoryId!.Value).Distinct().ToList();
        var products = await _db.Products.AsNoTracking().Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Name, ct);
        var categories = await _db.Categories.AsNoTracking().Where(c => categoryIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        return offers.Select(o => new IntegrationOffer(o.Id, o.Name, o.Type.ToString(), o.Value,
            o.StartsAtUtc, o.EndsAtUtc,
            o.AppliesToAllProducts ? "all products"
                : o.ProductId is not null ? products.GetValueOrDefault(o.ProductId.Value)
                : o.CategoryId is not null ? categories.GetValueOrDefault(o.CategoryId.Value) : null,
            o.ProductId?.ToString(), o.CategoryId?.ToString())).ToList();
    }

    private static bool OfferApplies(IntegrationOffer offer, Domain.Catalog.Product product)
        => offer.AppliesTo == "all products"
            || (offer.ProductId != null && Guid.TryParse(offer.ProductId, out var pid) && pid == product.Id)
            || (offer.CategoryId != null && Guid.TryParse(offer.CategoryId, out var cid) && cid == product.CategoryId);

    private static decimal EffectivePrice(Domain.Catalog.Product product, decimal listPrice, int quantity,
        List<IntegrationOffer> offers)
    {
        decimal best = listPrice;
        foreach (var offer in offers.Where(o => o.AppliesTo == "all products"
            || (o.ProductId != null && Guid.TryParse(o.ProductId, out var pid) && pid == product.Id)
            || (o.CategoryId != null && Guid.TryParse(o.CategoryId, out var cid) && cid == product.CategoryId)))
        {
            var candidate = offer.Type == nameof(DiscountType.Percentage)
                ? listPrice - Math.Round(listPrice * offer.Value / 100m, 2, MidpointRounding.AwayFromZero)
                : listPrice - offer.Value;
            if (candidate < 0) candidate = 0;
            if (candidate < best) best = candidate;
        }
        return Math.Round(best, 2, MidpointRounding.AwayFromZero);
    }
}
