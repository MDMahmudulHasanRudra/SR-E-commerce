namespace Commerce.Domain;

public enum WorkspaceStatus
{
    Active = 0,
    Suspended = 1
}

public enum UserRole
{
    Viewer = 0,
    Staff = 1,
    Manager = 2,
    Admin = 3,
    Owner = 4
}

public enum ProductStatus
{
    Draft = 0,
    Active = 1,
    Archived = 2
}

public enum StockMovementType
{
    Adjustment = 0,
    TransferIn = 1,
    TransferOut = 2,
    PurchaseReceipt = 3,
    Sale = 4,
    Return = 5,
    Reservation = 6,
    Release = 7
}

public enum OrderStatus
{
    Pending = 0,
    Confirmed = 1,
    Processing = 2,
    Shipped = 3,
    Delivered = 4,
    Cancelled = 5,
    Returned = 6,
    Refunded = 7
}

public enum OrderPaymentStatus
{
    Unpaid = 0,
    Partial = 1,
    Paid = 2,
    Refunded = 3
}

public enum FulfillmentStatus
{
    Unfulfilled = 0,
    PartiallyFulfilled = 1,
    Fulfilled = 2
}

public enum PurchaseOrderStatus
{
    Draft = 0,
    Ordered = 1,
    PartiallyReceived = 2,
    Received = 3,
    Cancelled = 4
}

public enum PaymentRecordStatus
{
    Pending = 0,
    Completed = 1,
    Failed = 2,
    Refunded = 3
}

public enum PaymentDirection
{
    Incoming = 0,
    Outgoing = 1
}

public enum DiscountType
{
    Percentage = 0,
    FixedAmount = 1
}

public enum ReturnStatus
{
    Requested = 0,
    Approved = 1,
    Rejected = 2,
    Refunded = 3
}

public enum ConnectionStatus
{
    NotConnected = 0,
    Pending = 1,
    Connecting = 2,
    Active = 3,
    Error = 4,
    Disabled = 5,
    Revoked = 6
}

public enum OutboxStatus
{
    Pending = 0,
    Processing = 1,
    Delivered = 2,
    Failed = 3,
    DeadLettered = 4
}
