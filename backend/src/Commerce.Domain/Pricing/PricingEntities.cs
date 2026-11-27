using Commerce.Domain.Common;

namespace Commerce.Domain.Pricing;

public class Offer : WorkspaceEntity
{
    public string Name { get; set; } = string.Empty;
    public DiscountType Type { get; set; }
    public decimal Value { get; set; }
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public bool AppliesToAllProducts { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? CategoryId { get; set; }
    public int MinQuantity { get; set; }

    public bool IsLiveAt(DateTime utc) => IsActive && StartsAtUtc <= utc && EndsAtUtc >= utc;
}

public class Coupon : WorkspaceEntity
{
    public string Code { get; set; } = string.Empty;
    public DiscountType Type { get; set; }
    public decimal Value { get; set; }
    public decimal MinOrderSubtotal { get; set; }
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public int? MaxRedemptions { get; set; }
    public int RedemptionCount { get; set; }

    public bool IsLiveAt(DateTime utc) =>
        IsActive && StartsAtUtc <= utc && EndsAtUtc >= utc &&
        (MaxRedemptions is null || RedemptionCount < MaxRedemptions);
}

public class PriceChange : WorkspaceEntity
{
    public Guid VariantId { get; set; }
    public decimal OldPrice { get; set; }
    public decimal NewPrice { get; set; }
    public string? Reason { get; set; }
    public Guid? ChangedByUserId { get; set; }
}
