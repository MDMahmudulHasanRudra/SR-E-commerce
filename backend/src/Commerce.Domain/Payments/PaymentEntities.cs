using Commerce.Domain.Common;

namespace Commerce.Domain.Payments;

public class Payment : WorkspaceEntity
{
    public Guid? OrderId { get; set; }
    public Guid? CustomerId { get; set; }
    public PaymentDirection Direction { get; set; } = PaymentDirection.Incoming;
    public string Method { get; set; } = "cash";
    public decimal Amount { get; set; }
    public string CurrencyCode { get; set; } = "USD";
    public PaymentRecordStatus Status { get; set; } = PaymentRecordStatus.Completed;
    public string? Reference { get; set; }
    public string? Notes { get; set; }
    public DateTime PaidAtUtc { get; set; } = DateTime.UtcNow;
}

public class Refund : WorkspaceEntity
{
    public Guid OrderId { get; set; }
    public Guid? PaymentId { get; set; }
    public decimal Amount { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string Status { get; set; } = "completed";
    public DateTime ProcessedAtUtc { get; set; } = DateTime.UtcNow;
}

public class Expense : WorkspaceEntity
{
    public string Category { get; set; } = "general";
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public DateTime PaidAtUtc { get; set; } = DateTime.UtcNow;
    public string Method { get; set; } = "cash";
    public string? Reference { get; set; }
}

public class TaxRate : WorkspaceEntity
{
    public string Name { get; set; } = string.Empty;
    public decimal Rate { get; set; }
    public bool IsDefault { get; set; }
    public bool IsInclusive { get; set; }
}
