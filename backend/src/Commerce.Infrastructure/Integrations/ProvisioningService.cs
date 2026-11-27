using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Identity;
using Commerce.Domain.Integrations;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Options;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Security;
using Commerce.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Commerce.Infrastructure.Integrations;

public sealed record ProvisioningRequest(
    string HostPlatform,
    string HostCustomerId,
    string HostProjectId,
    string? CustomerName,
    string? ProjectName,
    string? WorkspaceName,
    string? Currency,
    string? WebhookUrl,
    string? ExternalWorkspaceReference,
    string? CommerceWorkspaceId,
    string? ContractVersion,
    bool? AutoProvisionMembers = null,
    string? HostSignInUrl = null);

public sealed record ProvisioningResult(Guid TenantId, Guid WorkspaceId, Guid ConnectionId,
    string WorkspaceReference, string Status, string ApiContractVersion, string? ApiKey, string? Note);

public sealed class ProvisioningService
{
    private readonly CommerceDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly AuditService _audit;
    private readonly IntegrationOptions _options;

    public ProvisioningService(CommerceDbContext db, ITenantContext tenant, AuditService audit,
        IOptions<IntegrationOptions> options)
    {
        _db = db;
        _tenant = tenant;
        _audit = audit;
        _options = options.Value;
    }

    public async Task<ProvisioningResult> ProvisionAsync(ProvisioningRequest request, CancellationToken ct = default)
    {
        var hostPlatform = string.IsNullOrWhiteSpace(request.HostPlatform) ? "Get Assist" : request.HostPlatform.Trim();
        var hostCustomer = request.HostCustomerId?.Trim();
        var hostProject = request.HostProjectId?.Trim();
        if (string.IsNullOrWhiteSpace(hostCustomer) || string.IsNullOrWhiteSpace(hostProject))
            throw new DomainException(DomainErrors.Validation, "HostCustomerId and HostProjectId are required.");

        var existing = await _db.AppConnections.IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.HostPlatform == hostPlatform
                && c.HostCustomerId == hostCustomer && c.HostProjectId == hostProject, ct);
        if (existing is not null)
        {
            // The host may change its own sign-in policy on a signed re-provision; nothing else is touched.
            if (ApplyHostPolicy(existing, request))
            {
                _tenant.Set(existing.TenantId, existing.WorkspaceId, null, null);
                _audit.Record("integration.host_policy_changed", "AppConnection", existing.Id.ToString(),
                    $"autoProvisionMembers={existing.AutoProvisionMembers}");
                await _db.SaveChangesAsync(ct);
            }
            return new ProvisioningResult(existing.TenantId, existing.WorkspaceId, existing.Id,
                existing.ExternalWorkspaceReference ?? existing.WorkspaceId.ToString(),
                existing.Status.ToString(), existing.ApiContractVersion, null,
                "This project is already provisioned. No duplicate workspace was created.");
        }

        Guid tenantId;
        Guid workspaceId;
        string workspaceName;

        if (!string.IsNullOrWhiteSpace(request.CommerceWorkspaceId))
        {
            if (!Guid.TryParse(request.CommerceWorkspaceId, out var linkedWorkspaceId))
                throw new DomainException(DomainErrors.Validation, "CommerceWorkspaceId is not a valid identifier.");
            var workspace = await _db.Workspaces.IgnoreQueryFilters()
                .FirstOrDefaultAsync(w => w.Id == linkedWorkspaceId, ct)
                ?? throw new DomainException(DomainErrors.NotFound, "The Commerce workspace to link was not found.");
            var alreadyLinked = await _db.AppConnections.IgnoreQueryFilters()
                .AnyAsync(c => c.WorkspaceId == linkedWorkspaceId, ct);
            if (alreadyLinked)
                throw new DomainException(DomainErrors.Conflict, "That Commerce workspace is already linked to another host project.");

            tenantId = workspace.TenantId;
            workspaceId = workspace.Id;
            workspaceName = workspace.Name;
        }
        else
        {
            tenantId = Guid.NewGuid();
            workspaceId = Guid.NewGuid();
            workspaceName = string.IsNullOrWhiteSpace(request.WorkspaceName)
                ? string.IsNullOrWhiteSpace(request.ProjectName) ? "Commerce Store" : request.ProjectName.Trim()
                : request.WorkspaceName.Trim();
            var tenantName = string.IsNullOrWhiteSpace(request.CustomerName)
                ? workspaceName : request.CustomerName.Trim();
            var currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency.Trim().ToUpperInvariant();

            _tenant.Set(tenantId, workspaceId, null, null);

            var slug = await UniqueTenantSlugAsync(tenantName, ct);
            var tenant = new CommerceTenant
            {
                Id = tenantId,
                Name = tenantName,
                Slug = slug
            };
            var workspace = new CommerceWorkspace
            {
                Id = workspaceId,
                TenantId = tenantId,
                Name = workspaceName,
                Slug = $"{slug}-store",
                CurrencyCode = currency,
                IsPrimary = true
            };
            _db.AddRange(tenant, workspace);
            _db.Add(new Commerce.Domain.Inventory.Warehouse
            {
                TenantId = tenantId,
                WorkspaceId = workspaceId,
                Name = "Main Warehouse",
                Code = "MAIN",
                IsDefault = true
            });
            _db.Add(new Commerce.Domain.Payments.TaxRate
            {
                TenantId = tenantId,
                WorkspaceId = workspaceId,
                Name = "Standard",
                Rate = 0m,
                IsDefault = true
            });
            await _db.SaveChangesAsync(ct);
        }

        _tenant.Set(tenantId, workspaceId, null, null);

        var apiKey = $"cmk_{PasswordHasher.RandomToken(8)[..10]}_{PasswordHasher.RandomToken(32)}";
        var connection = new AppConnection
        {
            TenantId = tenantId,
            WorkspaceId = workspaceId,
            HostPlatform = hostPlatform,
            HostCustomerId = hostCustomer,
            HostProjectId = hostProject,
            ExternalWorkspaceReference = request.ExternalWorkspaceReference ?? workspaceId.ToString(),
            Status = ConnectionStatus.Active,
            WebhookUrl = string.IsNullOrWhiteSpace(request.WebhookUrl) ? null : request.WebhookUrl.Trim(),
            WebhookSecret = PasswordHasher.RandomToken(48),
            ApiContractVersion = string.IsNullOrWhiteSpace(request.ContractVersion) ? "v1" : request.ContractVersion.Trim(),
            LastConnectedAtUtc = DateTime.UtcNow,
            ProvisionedAtUtc = DateTime.UtcNow
        };
        ApplyHostPolicy(connection, request);
        _db.AppConnections.Add(connection);
        _db.ApiClients.Add(new ApiClient
        {
            TenantId = tenantId,
            WorkspaceId = workspaceId,
            Name = $"{hostPlatform} integration",
            KeyHash = PasswordHasher.Sha256Hex(apiKey),
            KeyPrefix = apiKey.Split('_')[1],
            Scopes = string.Join(' ', IntegrationScopes.ReadOnly)
        });
        _audit.Record("integration.provisioned", "AppConnection", connection.Id.ToString(),
            $"{hostPlatform} project {hostProject}");

        await _db.SaveChangesAsync(ct);

        return new ProvisioningResult(tenantId, workspaceId, connection.Id,
            connection.ExternalWorkspaceReference ?? workspaceId.ToString(), connection.Status.ToString(),
            connection.ApiContractVersion, apiKey,
            "Store this API key now. It is shown only once.");
    }

    /// <summary>Applies the host's sign-in policy from a signed request; returns whether anything changed. A
    /// field the request leaves out keeps its value.</summary>
    private static bool ApplyHostPolicy(AppConnection connection, ProvisioningRequest request)
    {
        var changed = false;
        if (request.AutoProvisionMembers is bool auto && connection.AutoProvisionMembers != auto)
        {
            connection.AutoProvisionMembers = auto;
            changed = true;
        }
        if (request.HostSignInUrl is not null)
        {
            var url = SafeHostSignInUrl(request.HostSignInUrl);
            if (connection.HostSignInUrl != url)
            {
                connection.HostSignInUrl = url;
                changed = true;
            }
        }
        return changed;
    }

    /// <summary>An absolute HTTPS address (HTTP only on loopback), no credentials, at most 500 characters; anything
    /// else is dropped rather than stored.</summary>
    public static string? SafeHostSignInUrl(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw.Length > 500) return null;
        if (!Uri.TryCreate(raw.Trim(), UriKind.Absolute, out var uri) || !string.IsNullOrEmpty(uri.UserInfo)) return null;
        if (uri.Scheme == Uri.UriSchemeHttps) return uri.AbsoluteUri;
        return uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback ? uri.AbsoluteUri : null;
    }

    private async Task<string> UniqueTenantSlugAsync(string name, CancellationToken ct)
    {
        var baseSlug = AuthService.Slugify(name);
        var slug = baseSlug;
        var i = 1;
        while (await _db.Tenants.IgnoreQueryFilters().AnyAsync(t => t.Slug == slug, ct))
            slug = $"{baseSlug}-{++i}";
        return slug;
    }
}
