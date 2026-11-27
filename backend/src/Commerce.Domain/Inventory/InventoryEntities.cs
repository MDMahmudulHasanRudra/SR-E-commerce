using Commerce.Domain.Common;

namespace Commerce.Domain.Inventory;

public class Warehouse : WorkspaceEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Address { get; set; }
    public bool IsDefault { get; set; }
    public bool IsActive { get; set; } = true;
}

public class StockItem : WorkspaceEntity
{
    public Guid WarehouseId { get; set; }
    public Guid VariantId { get; set; }
    public int QuantityOnHand { get; set; }
    public int QuantityReserved { get; set; }
    public int ReorderPoint { get; set; }
    public int ReorderQuantity { get; set; }

    public int Available => QuantityOnHand - QuantityReserved;
}

public class StockMovement : WorkspaceEntity
{
    public Guid WarehouseId { get; set; }
    public Guid VariantId { get; set; }
    public StockMovementType Type { get; set; }
    public int Quantity { get; set; }
    public int BalanceAfter { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
    public Guid? CreatedByUserId { get; set; }
}
