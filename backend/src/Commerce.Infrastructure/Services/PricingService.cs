using Commerce.Domain;
using Commerce.Domain.Catalog;
using Commerce.Domain.Common;
using Commerce.Domain.Pricing;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Services;

public sealed record PriceQuote(
    Guid VariantId,
    decimal ListPrice,
    decimal UnitPrice,
    decimal OfferDiscount,
    string? OfferName,
    string CurrencyCode);

public sealed record CouponQuote(Guid Id, string Code, decimal DiscountAmount, DiscountType Type, decimal Value);

public sealed record OfferInput(
    string Name,
    DiscountType Type,
    decimal Value,
    DateTime StartsAtUtc,
    DateTime EndsAtUtc,
    bool IsActive,
    bool AppliesToAllProducts,
    Guid? ProductId,
    Guid? CategoryId,
    int MinQuantity);

public sealed record CouponInput(
    string Code,
    DiscountType Type,
    decimal Value,
    decimal MinOrderSubtotal,
    DateTime StartsAtUtc,
    DateTime EndsAtUtc,
    bool IsActive,
    int? MaxRedemptions);

public sealed record OfferView(
    Guid Id,
    string Name,
    DiscountType Type,
    decimal Value,
    DateTime StartsAtUtc,
    DateTime EndsAtUtc,
    bool IsActive,
    bool IsLive,
    bool AppliesToAllProducts,
    Guid? ProductId,
    string? ProductName,
    Guid? CategoryId,
    string? CategoryName,
    int MinQuantity);

public sealed record CouponView(
    Guid Id,
    string Code,
    DiscountType Type,
    decimal Value,
    decimal MinOrderSubtotal,
    DateTime StartsAtUtc,
    DateTime EndsAtUtc,
    bool IsActive,
    bool IsLive,
    int? MaxRedemptions,
    int RedemptionCount);

public sealed class PricingService
{
    private readonly CommerceDbContext _db;

    public PricingService(CommerceDbContext db) => _db = db;

    public async Task<PriceQuote> GetEffectivePriceAsync(Guid variantId, int quantity = 1, DateTime? at = null, CancellationToken ct = default)
    {
        var now = at ?? DateTime.UtcNow;
        var variant = await _db.ProductVariants.FirstOrDefaultAsync(v => v.Id == variantId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product variant not found.");
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == variant.ProductId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Product not found.");

        var listPrice = variant.Price;
        var offers = await _db.Offers
            .Where(o => o.IsActive && o.StartsAtUtc <= now && o.EndsAtUtc >= now && o.MinQuantity <= quantity)
            .ToListAsync(ct);

        Offer? best = null;
        decimal bestPrice = listPrice;
        foreach (var offer in offers)
        {
            var applies = offer.AppliesToAllProducts
                || offer.ProductId == product.Id
                || (offer.CategoryId is not null && offer.CategoryId == product.CategoryId);
            if (!applies) continue;

            var candidate = offer.Type == DiscountType.Percentage
                ? Money.Round(listPrice - Money.Percent(listPrice, offer.Value))
                : Money.Round(listPrice - offer.Value);
            if (candidate < 0) candidate = 0;
            if (candidate < bestPrice || (best is null && candidate <= bestPrice))
            {
                best = offer;
                bestPrice = candidate;
            }
        }

        return new PriceQuote(variant.Id, listPrice, bestPrice, Money.Round(listPrice - bestPrice),
            best?.Name, product.CurrencyCode);
    }

    public async Task<PriceQuote> GetQuoteAsync(Guid variantId, int quantity = 1, CancellationToken ct = default)
        => await GetEffectivePriceAsync(variantId, quantity, null, ct);

    public async Task<CouponQuote?> ValidateCouponAsync(string? code, decimal subtotal, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        var normalized = code.Trim().ToUpperInvariant();
        var now = DateTime.UtcNow;
        var coupon = await _db.Coupons.FirstOrDefaultAsync(c => c.Code.ToUpper() == normalized, ct);
        if (coupon is null || !coupon.IsLiveAt(now))
            throw new DomainException(DomainErrors.Validation, "Coupon is not valid or has expired.");
        if (subtotal < coupon.MinOrderSubtotal)
            throw new DomainException(DomainErrors.Validation,
                $"Coupon requires a minimum subtotal of {coupon.MinOrderSubtotal:0.00}.");

        var discount = coupon.Type == DiscountType.Percentage
            ? Money.Percent(subtotal, coupon.Value)
            : coupon.Value;
        discount = Math.Min(discount, subtotal);
        return new CouponQuote(coupon.Id, coupon.Code, Money.Round(discount), coupon.Type, coupon.Value);
    }

    public async Task RedeemCouponAsync(Guid couponId, CancellationToken ct = default)
    {
        var coupon = await _db.Coupons.FirstOrDefaultAsync(c => c.Id == couponId, ct);
        if (coupon is null) return;
        coupon.RedemptionCount++;
        if (coupon.MaxRedemptions is not null && coupon.RedemptionCount >= coupon.MaxRedemptions)
            coupon.IsActive = false;
    }

    public async Task<(IReadOnlyList<OfferView> Active, IReadOnlyList<OfferView> All, IReadOnlyList<CouponView> Coupons)> ListAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var offers = await _db.Offers.OrderByDescending(o => o.CreatedAtUtc).ToListAsync(ct);
        var productIds = offers.Where(o => o.ProductId != null).Select(o => o.ProductId!.Value).Distinct().ToList();
        var categoryIds = offers.Where(o => o.CategoryId != null).Select(o => o.CategoryId!.Value).Distinct().ToList();
        var products = await _db.Products.Where(p => productIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.Name, ct);
        var categories = await _db.Categories.Where(c => categoryIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        var views = offers.Select(o => new OfferView(o.Id, o.Name, o.Type, o.Value, o.StartsAtUtc,
            o.EndsAtUtc, o.IsActive, o.IsLiveAt(now), o.AppliesToAllProducts, o.ProductId,
            o.ProductId is not null ? products.GetValueOrDefault(o.ProductId.Value) : o.AppliesToAllProducts ? "All products" : null,
            o.CategoryId, o.CategoryId is not null ? categories.GetValueOrDefault(o.CategoryId.Value) : null, o.MinQuantity)).ToList();

        var coupons = await _db.Coupons.OrderByDescending(c => c.CreatedAtUtc).ToListAsync(ct);
        return (views.Where(v => v.IsLive).ToList(), views, coupons.Select(ToCouponView).ToList());
    }

    public async Task<OfferView> CreateOfferAsync(OfferInput input, CancellationToken ct = default)
    {
        ValidateOffer(input);
        var offer = new Offer
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            Name = input.Name.Trim(),
            Type = input.Type,
            Value = input.Value,
            StartsAtUtc = input.StartsAtUtc,
            EndsAtUtc = input.EndsAtUtc,
            IsActive = input.IsActive,
            AppliesToAllProducts = input.AppliesToAllProducts,
            ProductId = input.AppliesToAllProducts ? null : input.ProductId,
            CategoryId = input.AppliesToAllProducts ? null : input.CategoryId,
            MinQuantity = input.MinQuantity
        };
        _db.Offers.Add(offer);
        await _db.SaveChangesAsync(ct);
        return await BuildOfferViewAsync(offer, ct);
    }

    public async Task<OfferView> UpdateOfferAsync(Guid id, OfferInput input, CancellationToken ct = default)
    {
        ValidateOffer(input);
        var offer = await _db.Offers.FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Offer not found.");
        offer.Name = input.Name.Trim();
        offer.Type = input.Type;
        offer.Value = input.Value;
        offer.StartsAtUtc = input.StartsAtUtc;
        offer.EndsAtUtc = input.EndsAtUtc;
        offer.IsActive = input.IsActive;
        offer.AppliesToAllProducts = input.AppliesToAllProducts;
        offer.ProductId = input.AppliesToAllProducts ? null : input.ProductId;
        offer.CategoryId = input.AppliesToAllProducts ? null : input.CategoryId;
        offer.MinQuantity = input.MinQuantity;
        await _db.SaveChangesAsync(ct);
        return await BuildOfferViewAsync(offer, ct);
    }

    public async Task DeleteOfferAsync(Guid id, CancellationToken ct = default)
    {
        var offer = await _db.Offers.FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Offer not found.");
        _db.Offers.Remove(offer);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<CouponView> CreateCouponAsync(CouponInput input, CancellationToken ct = default)
    {
        var code = ValidateCouponInput(input);
        if (await _db.Coupons.AnyAsync(c => c.Code.ToUpper() == code, ct))
            throw new DomainException(DomainErrors.Conflict, "A coupon with this code already exists.");

        var coupon = new Coupon
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            Code = code,
            Type = input.Type,
            Value = input.Value,
            MinOrderSubtotal = input.MinOrderSubtotal,
            StartsAtUtc = input.StartsAtUtc,
            EndsAtUtc = input.EndsAtUtc,
            IsActive = input.IsActive,
            MaxRedemptions = input.MaxRedemptions
        };
        _db.Coupons.Add(coupon);
        await _db.SaveChangesAsync(ct);
        return ToCouponView(coupon);
    }

    public async Task<CouponView> UpdateCouponAsync(Guid id, CouponInput input, CancellationToken ct = default)
    {
        var code = ValidateCouponInput(input);
        var coupon = await _db.Coupons.FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Coupon not found.");
        if (await _db.Coupons.AnyAsync(c => c.Id != id && c.Code.ToUpper() == code, ct))
            throw new DomainException(DomainErrors.Conflict, "A coupon with this code already exists.");

        coupon.Code = code;
        coupon.Type = input.Type;
        coupon.Value = input.Value;
        coupon.MinOrderSubtotal = input.MinOrderSubtotal;
        coupon.StartsAtUtc = input.StartsAtUtc;
        coupon.EndsAtUtc = input.EndsAtUtc;
        coupon.IsActive = input.IsActive;
        coupon.MaxRedemptions = input.MaxRedemptions;
        await _db.SaveChangesAsync(ct);
        return ToCouponView(coupon);
    }

    public async Task DeleteCouponAsync(Guid id, CancellationToken ct = default)
    {
        var coupon = await _db.Coupons.FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Coupon not found.");
        _db.Coupons.Remove(coupon);
        await _db.SaveChangesAsync(ct);
    }

    private async Task<OfferView> BuildOfferViewAsync(Offer o, CancellationToken ct)
    {
        var productName = o.ProductId is null ? null : (await _db.Products.FirstOrDefaultAsync(p => p.Id == o.ProductId, ct))?.Name;
        var categoryName = o.CategoryId is null ? null : (await _db.Categories.FirstOrDefaultAsync(c => c.Id == o.CategoryId, ct))?.Name;
        return new OfferView(o.Id, o.Name, o.Type, o.Value, o.StartsAtUtc, o.EndsAtUtc, o.IsActive,
            o.IsLiveAt(DateTime.UtcNow), o.AppliesToAllProducts, o.ProductId,
            o.AppliesToAllProducts ? "All products" : productName, o.CategoryId, categoryName, o.MinQuantity);
    }

    private static CouponView ToCouponView(Coupon c) => new(c.Id, c.Code, c.Type, c.Value,
        c.MinOrderSubtotal, c.StartsAtUtc, c.EndsAtUtc, c.IsActive, c.IsLiveAt(DateTime.UtcNow),
        c.MaxRedemptions, c.RedemptionCount);

    private static void ValidateOffer(OfferInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name))
            throw new DomainException(DomainErrors.Validation, "Offer name is required.");
        if (input.EndsAtUtc <= input.StartsAtUtc)
            throw new DomainException(DomainErrors.Validation, "Offer end must be after its start.");
        if (input.Value <= 0)
            throw new DomainException(DomainErrors.Validation, "Offer value must be greater than zero.");
        if (input.Type == DiscountType.Percentage && input.Value > 100)
            throw new DomainException(DomainErrors.Validation, "Percentage discount cannot exceed 100%.");
    }

    private static string ValidateCouponInput(CouponInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Code))
            throw new DomainException(DomainErrors.Validation, "Coupon code is required.");
        if (input.EndsAtUtc <= input.StartsAtUtc)
            throw new DomainException(DomainErrors.Validation, "Coupon end must be after its start.");
        if (input.Value <= 0)
            throw new DomainException(DomainErrors.Validation, "Coupon value must be greater than zero.");
        if (input.Type == DiscountType.Percentage && input.Value > 100)
            throw new DomainException(DomainErrors.Validation, "Percentage discount cannot exceed 100%.");
        return input.Code.Trim().ToUpperInvariant();
    }
}
