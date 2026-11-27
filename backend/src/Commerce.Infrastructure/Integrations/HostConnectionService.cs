using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Integrations;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Security;
using Commerce.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Integrations;

/// <summary>Signed by the host with the provisioning secret: which host project's connection is meant.</summary>
public sealed record HostConnectionRequest(string HostPlatform, string HostCustomerId, string HostProjectId);

/// <summary>The connection after a host action. <c>ApiKey</c> is set only by a key replacement, and shown once.</summary>
public sealed record HostConnectionResult(Guid WorkspaceId, Guid ConnectionId, string Status, string? ApiKey, string? Note);

/// <summary>
/// What the host platform may do to ITS OWN connection, signed with the provisioning secret like provisioning:
/// <list type="bullet">
/// <item>replace the integration key when the host lost it (the old integration keys are revoked at once);</item>
/// <item>pause the connection from the host side, and resume a pause it made itself.</item>
/// </list>
/// A Commerce admin stays in charge: the host can never resume a connection a Commerce admin disabled, and never
/// touch a revoked one. Keys a Commerce admin created by hand are never touched.
/// </summary>
public sealed class HostConnectionService
{
    /// <summary>Written to <c>LastError</c> by a host pause; it is how a later resume knows the pause was the host's.</summary>
    public const string HostPausedMarker = "Paused from the host platform.";

    private readonly CommerceDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly AuditService _audit;

    public HostConnectionService(CommerceDbContext db, ITenantContext tenant, AuditService audit)
    {
        _db = db;
        _tenant = tenant;
        _audit = audit;
    }

    public async Task<HostConnectionResult> ReplaceKeyAsync(HostConnectionRequest request, CancellationToken ct = default)
    {
        var connection = await FindAsync(request, ct);
        if (connection.Status == ConnectionStatus.Revoked)
            throw new DomainException(DomainErrors.Forbidden, "This connection was revoked in Commerce and must be provisioned again.");
        if (connection.Status != ConnectionStatus.Active)
            throw new DomainException(DomainErrors.Forbidden, "This connection is not active in Commerce, so no key was issued.");

        _tenant.Set(connection.TenantId, connection.WorkspaceId, null, null);
        var integrationKeyName = $"{connection.HostPlatform} integration";
        var now = DateTime.UtcNow;
        var old = await _db.ApiClients.IgnoreQueryFilters()
            .Where(k => k.WorkspaceId == connection.WorkspaceId && k.Name == integrationKeyName && !k.IsRevoked)
            .ToListAsync(ct);
        foreach (var key in old)
        {
            key.IsRevoked = true;
            key.RevokedAtUtc = now;
        }

        var apiKey = $"cmk_{PasswordHasher.RandomToken(8)[..10]}_{PasswordHasher.RandomToken(32)}";
        _db.ApiClients.Add(new ApiClient
        {
            TenantId = connection.TenantId,
            WorkspaceId = connection.WorkspaceId,
            Name = integrationKeyName,
            KeyHash = PasswordHasher.Sha256Hex(apiKey),
            KeyPrefix = apiKey.Split('_')[1],
            Scopes = string.Join(' ', IntegrationScopes.ReadOnly)
        });
        _audit.Record("integration.key_replaced", "AppConnection", connection.Id.ToString(),
            $"{connection.HostPlatform}: {old.Count} old integration key(s) revoked");
        await _db.SaveChangesAsync(ct);
        return new HostConnectionResult(connection.WorkspaceId, connection.Id, connection.Status.ToString(), apiKey,
            "Store this API key now. It is shown only once.");
    }

    public async Task<HostConnectionResult> PauseAsync(HostConnectionRequest request, CancellationToken ct = default)
    {
        var connection = await FindAsync(request, ct);
        if (connection.Status == ConnectionStatus.Active)
        {
            _tenant.Set(connection.TenantId, connection.WorkspaceId, null, null);
            connection.Status = ConnectionStatus.Disabled;
            connection.DisabledAtUtc = DateTime.UtcNow;
            connection.LastError = HostPausedMarker;
            _audit.Record("integration.host_paused", "AppConnection", connection.Id.ToString(), connection.HostPlatform);
            await _db.SaveChangesAsync(ct);
        }
        // Already disabled or revoked: nothing reaches it either way, so there is nothing to do.
        return new HostConnectionResult(connection.WorkspaceId, connection.Id, connection.Status.ToString(), null, null);
    }

    public async Task<HostConnectionResult> ResumeAsync(HostConnectionRequest request, CancellationToken ct = default)
    {
        var connection = await FindAsync(request, ct);
        if (connection.Status == ConnectionStatus.Active)
            return new HostConnectionResult(connection.WorkspaceId, connection.Id, connection.Status.ToString(), null, null);
        if (connection.Status != ConnectionStatus.Disabled || connection.LastError != HostPausedMarker)
            throw new DomainException(DomainErrors.Forbidden,
                connection.Status == ConnectionStatus.Revoked
                    ? "This connection was revoked in Commerce and must be provisioned again."
                    : "A Commerce admin turned this connection off. Only a Commerce admin can turn it back on (Settings → Integration).");

        _tenant.Set(connection.TenantId, connection.WorkspaceId, null, null);
        connection.Status = ConnectionStatus.Active;
        connection.DisabledAtUtc = null;
        connection.LastError = null;
        connection.LastConnectedAtUtc = DateTime.UtcNow;
        _audit.Record("integration.host_resumed", "AppConnection", connection.Id.ToString(), connection.HostPlatform);
        await _db.SaveChangesAsync(ct);
        return new HostConnectionResult(connection.WorkspaceId, connection.Id, connection.Status.ToString(), null, null);
    }

    private async Task<AppConnection> FindAsync(HostConnectionRequest request, CancellationToken ct)
    {
        var hostPlatform = string.IsNullOrWhiteSpace(request.HostPlatform) ? "Get Assist" : request.HostPlatform.Trim();
        var hostCustomer = request.HostCustomerId?.Trim();
        var hostProject = request.HostProjectId?.Trim();
        if (string.IsNullOrWhiteSpace(hostCustomer) || string.IsNullOrWhiteSpace(hostProject))
            throw new DomainException(DomainErrors.Validation, "HostCustomerId and HostProjectId are required.");
        return await _db.AppConnections.IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.HostPlatform == hostPlatform
                && c.HostCustomerId == hostCustomer && c.HostProjectId == hostProject, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "This host project is not connected to Commerce.");
    }
}
