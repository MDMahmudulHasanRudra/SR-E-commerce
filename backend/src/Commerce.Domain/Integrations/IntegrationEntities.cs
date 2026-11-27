using Commerce.Domain.Common;

namespace Commerce.Domain.Integrations;

public class AppConnection : WorkspaceEntity
{
    public string HostPlatform { get; set; } = "Get Assist";
    public string HostCustomerId { get; set; } = string.Empty;
    public string HostProjectId { get; set; } = string.Empty;
    public string? ExternalWorkspaceReference { get; set; }
    public ConnectionStatus Status { get; set; } = ConnectionStatus.Pending;
    public string? WebhookUrl { get; set; }
    public string? WebhookSecret { get; set; }
    public string ApiContractVersion { get; set; } = "v1";
    public DateTime? LastConnectedAtUtc { get; set; }
    public DateTime? LastEventDeliveredAtUtc { get; set; }
    public string? LastError { get; set; }
    public DateTime? ProvisionedAtUtc { get; set; }
    public DateTime? DisabledAtUtc { get; set; }
    /// <summary>The host's written policy (signed provisioning): a person the host sends here for the first time
    /// gets a Commerce account and membership, audited, instead of having to link an existing one.</summary>
    public bool AutoProvisionMembers { get; set; }
    /// <summary>Where "Continue with {HostPlatform}" sends a person to sign in on the host and come back here.
    /// HTTPS only (HTTP only on loopback), set by signed provisioning.</summary>
    public string? HostSignInUrl { get; set; }
}

public class ApiClient : WorkspaceEntity
{
    public string Name { get; set; } = string.Empty;
    public string KeyHash { get; set; } = string.Empty;
    public string KeyPrefix { get; set; } = string.Empty;
    public string Scopes { get; set; } = string.Empty;
    public bool IsRevoked { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
    public DateTime? LastUsedAtUtc { get; set; }
}

public class OutboxEvent : Entity
{
    public Guid TenantId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string Type { get; set; } = string.Empty;
    public int Version { get; set; } = 1;
    public DateTime OccurredAtUtc { get; set; } = DateTime.UtcNow;
    public string SubjectId { get; set; } = string.Empty;
    public string PayloadJson { get; set; } = "{}";
    public OutboxStatus Status { get; set; } = OutboxStatus.Pending;
    public int Attempts { get; set; }
    public DateTime NextAttemptAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DeliveredAtUtc { get; set; }
    public string? LastError { get; set; }
}

public class DeliveryLog : Entity
{
    public Guid TenantId { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid OutboxEventId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public int Attempt { get; set; }
    public bool Success { get; set; }
    public int? StatusCode { get; set; }
    public string? Error { get; set; }
    public int DurationMs { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// A host user (pseudonymous, per connection) linked to one Commerce user. Created only after the person proved
/// the Commerce account by signing in to it once; never created from the host's word alone.
/// </summary>
public class HostIdentityLink : WorkspaceEntity
{
    public Guid ConnectionId { get; set; }
    public string Subject { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public DateTime? LastSignInAtUtc { get; set; }
}

public enum HostLaunchKind
{
    SignIn = 1,
    Link = 2
}

/// <summary>A single-use, short-lived code the host hands to the browser. Only its SHA-256 hash is stored.</summary>
public class HostLaunchCode : Entity
{
    public Guid TenantId { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid ConnectionId { get; set; }
    public string CodeHash { get; set; } = string.Empty;
    public HostLaunchKind Kind { get; set; }
    public Guid? UserId { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string ReturnPath { get; set; } = "/dashboard";
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? UsedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
