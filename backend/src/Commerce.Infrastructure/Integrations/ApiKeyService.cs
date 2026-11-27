using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Identity;
using Commerce.Domain.Integrations;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Options;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Commerce.Infrastructure.Integrations;

public static class IntegrationScopes
{
    public const string ProductsRead = "products.read";
    public const string CustomersRead = "customers.read";
    public const string OrdersRead = "orders.read";
    public const string OffersRead = "offers.read";

    public static readonly string[] ReadOnly = [ProductsRead, CustomersRead, OrdersRead, OffersRead];
    public static readonly string[] All = ReadOnly; // write scopes intentionally do not exist yet.
}

public sealed record ApiClientView(Guid Id, string Name, string KeyPrefix, string[] Scopes, bool IsRevoked,
    DateTime? LastUsedAtUtc, DateTime CreatedAtUtc);
public sealed record CreatedApiKey(ApiClientView Client, string Key);

public sealed record ApiClientIdentity(Guid ClientId, Guid TenantId, Guid WorkspaceId, string Name, string[] Scopes);
public sealed record ApiAuthResult(ApiClientIdentity? Identity, string? ErrorCode, string? Error);

public sealed class ApiKeyService
{
    private readonly CommerceDbContext _db;
    private readonly IntegrationOptions _options;

    public ApiKeyService(CommerceDbContext db, IOptions<IntegrationOptions> options)
    {
        _db = db;
        _options = options.Value;
    }

    public async Task<ApiAuthResult> AuthenticateAsync(string rawKey, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(rawKey)) return new(null, "UNAUTHORIZED", "An API key is required.");
        var hash = PasswordHasher.Sha256Hex(rawKey.Trim());
        var client = await _db.ApiClients.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.KeyHash == hash, ct);
        if (client is null || client.IsRevoked)
            return new(null, "UNAUTHORIZED", "The API key is invalid or revoked.");

        var workspace = await _db.Workspaces.IgnoreQueryFilters()
            .FirstOrDefaultAsync(w => w.Id == client.WorkspaceId && w.Status == WorkspaceStatus.Active, ct);
        if (workspace is null)
            return new(null, "FORBIDDEN", "The workspace is not available.");

        if (_options.RequireActiveConnection)
        {
            var connection = await _db.AppConnections.IgnoreQueryFilters()
                .FirstOrDefaultAsync(c => c.WorkspaceId == client.WorkspaceId, ct);
            if (connection is null || connection.Status != ConnectionStatus.Active)
                return new(null, "INTEGRATION_DISABLED", "The host platform connection is not active.");
        }

        if (client.LastUsedAtUtc is null || client.LastUsedAtUtc < DateTime.UtcNow.AddMinutes(-5))
        {
            client.LastUsedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
        }

        var scopes = client.Scopes.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return new(new ApiClientIdentity(client.Id, client.TenantId, client.WorkspaceId, client.Name, scopes), null, null);
    }

    public async Task<IReadOnlyList<ApiClientView>> ListAsync(CancellationToken ct = default)
    {
        var clients = await _db.ApiClients.AsNoTracking().OrderByDescending(c => c.CreatedAtUtc).ToListAsync(ct);
        return clients.Select(ToView).ToList();
    }

    public async Task<CreatedApiKey> CreateAsync(string name, IReadOnlyList<string> scopes, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new DomainException(DomainErrors.Validation, "API key name is required.");
        var requested = scopes.Count == 0 ? IntegrationScopes.ReadOnly : scopes;
        var unknown = requested.Where(s => !IntegrationScopes.All.Contains(s)).ToList();
        if (unknown.Count > 0)
            throw new DomainException(DomainErrors.Validation, $"Unknown scope(s): {string.Join(", ", unknown)}.");

        var prefix = PasswordHasher.RandomToken(8)[..10];
        var secret = PasswordHasher.RandomToken(32);
        var raw = $"cmk_{prefix}_{secret}";
        var client = new ApiClient
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            Name = name.Trim(),
            KeyHash = PasswordHasher.Sha256Hex(raw),
            KeyPrefix = prefix,
            Scopes = string.Join(' ', requested)
        };
        _db.ApiClients.Add(client);
        await _db.SaveChangesAsync(ct);
        return new CreatedApiKey(ToView(client), raw);
    }

    public async Task RevokeAsync(Guid id, CancellationToken ct = default)
    {
        var client = await _db.ApiClients.FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "API key not found.");
        client.IsRevoked = true;
        client.RevokedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    private static ApiClientView ToView(ApiClient c) => new(c.Id, c.Name, c.KeyPrefix,
        c.Scopes.Split(' ', StringSplitOptions.RemoveEmptyEntries), c.IsRevoked, c.LastUsedAtUtc, c.CreatedAtUtc);
}
