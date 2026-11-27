using Commerce.Domain.Common;

namespace Commerce.Domain.Identity;

public class CommerceTenant : Entity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Status { get; set; } = "Active";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class CommerceWorkspace : TenantEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string CurrencyCode { get; set; } = "USD";
    public string TimeZone { get; set; } = "UTC";
    public WorkspaceStatus Status { get; set; } = WorkspaceStatus.Active;
    public bool IsPrimary { get; set; } = true;
}

public class CommerceUser : TenantEntity
{
    public string Email { get; set; } = string.Empty;
    public string NormalizedEmail { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public string? ExternalIssuer { get; set; }
    public string? ExternalSubject { get; set; }
    public string PreferredTheme { get; set; } = "system";
    public DateTime? LastLoginAtUtc { get; set; }
}

public class CommerceMembership : TenantEntity
{
    public Guid WorkspaceId { get; set; }
    public Guid UserId { get; set; }
    public UserRole Role { get; set; } = UserRole.Viewer;
    public bool IsActive { get; set; } = true;
}

public class RefreshToken : Entity
{
    public Guid TenantId { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class AuditLog : WorkspaceEntity
{
    public Guid? UserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string? Details { get; set; }
    public string? CorrelationId { get; set; }
}
