using Commerce.Domain.Common;

namespace Commerce.Domain.Purchasing;

public class Supplier : WorkspaceEntity
{
    public string Name { get; set; } = string.Empty;
    public string? ContactName { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
}

public class PurchaseOrder : WorkspaceEntity
{
    public string PoNumber { get; set; } = string.Empty;
    public Guid SupplierId { get; set; }
    public PurchaseOrderStatus Status { get; set; } = PurchaseOrderStatus.Draft;
    public DateTime OrderDateUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ExpectedDateUtc { get; set; }
    public decimal Subtotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal Total { get; set; }
    public decimal AmountPaid { get; set; }
    public string CurrencyCode { get; set; } = "USD";
    public string? Notes { get; set; }
}

public class PurchaseOrderItem : WorkspaceEntity
{
    public Guid PurchaseOrderId { get; set; }
    public Guid VariantId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string Sku { get; set; } = string.Empty;
    public int QuantityOrdered { get; set; }
    public int QuantityReceived { get; set; }
    public decimal UnitCost { get; set; }
    public decimal LineTotal { get; set; }
}

public class GoodsReceipt : WorkspaceEntity
{
    public Guid PurchaseOrderId { get; set; }
    public Guid WarehouseId { get; set; }
    public DateTime ReceivedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid? ReceivedByUserId { get; set; }
    public string? Notes { get; set; }
}

public class SupplierPayment : WorkspaceEntity
{
    public Guid SupplierId { get; set; }
    public Guid? PurchaseOrderId { get; set; }
    public decimal Amount { get; set; }
    public DateTime PaidAtUtc { get; set; } = DateTime.UtcNow;
    public string Method { get; set; } = "bank";
    public string? Reference { get; set; }
}
