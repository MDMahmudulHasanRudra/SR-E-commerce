using Commerce.Domain.Common;

namespace Commerce.Domain.Orders;

public class Order : WorkspaceEntity
{
    public string OrderNumber { get; set; } = string.Empty;
    public Guid? CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string? CustomerEmail { get; set; }
    public string? CustomerPhone { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public OrderPaymentStatus PaymentStatus { get; set; } = OrderPaymentStatus.Unpaid;
    public FulfillmentStatus FulfillmentStatus { get; set; } = FulfillmentStatus.Unfulfilled;
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal ShippingTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public decimal PaidTotal { get; set; }
    public decimal RefundedTotal { get; set; }
    public string CurrencyCode { get; set; } = "USD";
    public string? CouponCode { get; set; }
    public string? ShippingAddressJson { get; set; }
    public string? Notes { get; set; }
    public string? Source { get; set; } = "standalone";
    public string? ExternalOrderId { get; set; }
    public DateTime PlacedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ConfirmedAtUtc { get; set; }
    public DateTime? ShippedAtUtc { get; set; }
    public DateTime? DeliveredAtUtc { get; set; }
    public DateTime? CancelledAtUtc { get; set; }

    public bool IsOpen => Status is OrderStatus.Pending or OrderStatus.Confirmed
        or OrderStatus.Processing or OrderStatus.Shipped;
}

public class OrderItem : WorkspaceEntity
{
    public Guid OrderId { get; set; }
    public Guid? VariantId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string Sku { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal UnitCost { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
}

public class OrderEvent : WorkspaceEntity
{
    public Guid OrderId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string? Message { get; set; }
    public Guid? UserId { get; set; }
}

public class Invoice : WorkspaceEntity
{
    public Guid OrderId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public DateTime IssuedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime DueAtUtc { get; set; } = DateTime.UtcNow.AddDays(14);
    public decimal Amount { get; set; }
    public string Status { get; set; } = "Issued";
}

public class OrderReturn : WorkspaceEntity
{
    public Guid OrderId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public ReturnStatus Status { get; set; } = ReturnStatus.Requested;
    public decimal RefundAmount { get; set; }
    public string? ItemsJson { get; set; }
    public DateTime? ProcessedAtUtc { get; set; }
}
