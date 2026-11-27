namespace Commerce.Domain.Common;

public abstract class Entity
{
    public Guid Id { get; set; } = Guid.NewGuid();
}

public abstract class TenantEntity : Entity
{
    public Guid TenantId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public abstract class WorkspaceEntity : TenantEntity
{
    public Guid WorkspaceId { get; set; }
}

public class DomainException : Exception
{
    public DomainException(string code, string message) : base(message) => Code = code;

    public string Code { get; }
}

public static class DomainErrors
{
    public const string NotFound = "NOT_FOUND";
    public const string Validation = "VALIDATION_ERROR";
    public const string Conflict = "CONFLICT";
    public const string Forbidden = "FORBIDDEN";
    public const string InsufficientStock = "INSUFFICIENT_STOCK";
    public const string InvalidState = "INVALID_STATE";
    public const string Unauthorized = "UNAUTHORIZED";
}
