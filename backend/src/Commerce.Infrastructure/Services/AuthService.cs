using System.Text.RegularExpressions;
using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Identity;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Options;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Seeding;
using Commerce.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Commerce.Infrastructure.Services;

public sealed record RegisterRequest(
    string CompanyName,
    string FullName,
    string Email,
    string Password,
    string? WorkspaceName = null,
    string? Currency = null,
    bool SeedDemoData = true);

public sealed record LoginRequest(string Email, string Password);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record AuthenticatedUser(
    Guid UserId,
    Guid TenantId,
    Guid WorkspaceId,
    string Email,
    string FullName,
    string CompanyName,
    string WorkspaceName,
    string Role,
    string CurrencyCode,
    string TimeZone,
    string[] Permissions);

public sealed record AuthResult(AuthenticatedUser User, string RefreshToken, DateTime RefreshTokenExpiresAtUtc);

public sealed record WorkspaceOption(Guid WorkspaceId, string Name, string TenantName, string Role, string CurrencyCode, bool IsPrimary);

public sealed class AuthService
{
    private readonly CommerceDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly AuthOptions _options;
    private readonly DemoDataSeeder _demo;
    private readonly AuditService _audit;

    public AuthService(CommerceDbContext db, ITenantContext tenant, IOptions<AuthOptions> options, DemoDataSeeder demo,
        AuditService audit)
    {
        _db = db;
        _tenant = tenant;
        _options = options.Value;
        _demo = demo;
        _audit = audit;
    }

    public async Task<AuthResult> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        var company = request.CompanyName?.Trim() ?? string.Empty;
        var fullName = request.FullName?.Trim() ?? string.Empty;
        var email = request.Email?.Trim().ToLowerInvariant() ?? string.Empty;

        if (company.Length < 2) throw new DomainException(DomainErrors.Validation, "Company name is required.");
        if (fullName.Length < 2) throw new DomainException(DomainErrors.Validation, "Your name is required.");
        if (!Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
            throw new DomainException(DomainErrors.Validation, "A valid email address is required.");
        if (request.Password is null || request.Password.Length < 8)
            throw new DomainException(DomainErrors.Validation, "Password must be at least 8 characters.");

        if (await _db.Users.IgnoreQueryFilters().AnyAsync(u => u.NormalizedEmail == email, ct))
            throw new DomainException(DomainErrors.Conflict, "An account with this email already exists.");

        var tenantId = Guid.NewGuid();
        var workspaceId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency.Trim().ToUpperInvariant();
        var now = DateTime.UtcNow;

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var tenant = new CommerceTenant
        {
            Id = tenantId,
            Name = company,
            Slug = await UniqueTenantSlugAsync(company, ct),
            CreatedAtUtc = now
        };
        var workspace = new CommerceWorkspace
        {
            Id = workspaceId,
            TenantId = tenantId,
            Name = string.IsNullOrWhiteSpace(request.WorkspaceName) ? company : request.WorkspaceName.Trim(),
            Slug = Slugify(string.IsNullOrWhiteSpace(request.WorkspaceName) ? company : request.WorkspaceName),
            CurrencyCode = currency,
            IsPrimary = true,
            CreatedAtUtc = now
        };
        var user = new CommerceUser
        {
            Id = userId,
            TenantId = tenantId,
            Email = email,
            NormalizedEmail = email,
            FullName = fullName,
            PasswordHash = PasswordHasher.Hash(request.Password),
            CreatedAtUtc = now
        };
        var membership = new CommerceMembership
        {
            TenantId = tenantId,
            WorkspaceId = workspaceId,
            UserId = userId,
            Role = UserRole.Owner,
            CreatedAtUtc = now
        };
        var warehouse = new Commerce.Domain.Inventory.Warehouse
        {
            TenantId = tenantId,
            WorkspaceId = workspaceId,
            Name = "Main Warehouse",
            Code = "MAIN",
            IsDefault = true,
            CreatedAtUtc = now
        };
        var taxRate = new Commerce.Domain.Payments.TaxRate
        {
            TenantId = tenantId,
            WorkspaceId = workspaceId,
            Name = "Standard",
            Rate = 0m,
            IsDefault = true,
            CreatedAtUtc = now
        };

        _db.AddRange(tenant, workspace, user, membership, warehouse, taxRate);
        await _db.SaveChangesAsync(ct);

        _tenant.Set(tenantId, workspaceId, userId, UserRole.Owner);

        if (request.SeedDemoData)
            await _demo.SeedAsync(_db, workspaceId, ct);

        var refresh = await IssueRefreshTokenAsync(tenantId, workspaceId, userId, ct);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        var authUser = new AuthenticatedUser(userId, tenantId, workspaceId, email, fullName, company,
            workspace.Name, UserRole.Owner.ToString(), currency, workspace.TimeZone, RolePermissions.For(UserRole.Owner));
        return new AuthResult(authUser, refresh.Token, refresh.ExpiresAtUtc);
    }

    public async Task<AuthResult> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var identifier = request.Email?.Trim().ToLowerInvariant() ?? string.Empty;
        var email = identifier.Contains('@') ? identifier : $"{identifier}@{_options.UsernameDomain}";
        var user = await _db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.NormalizedEmail == email && u.IsActive, ct);
        if (user is null || !PasswordHasher.Verify(request.Password ?? string.Empty, user.PasswordHash))
            throw new DomainException(DomainErrors.Unauthorized, "Invalid email or password.");

        var membership = await _db.Memberships.IgnoreQueryFilters()
            .Where(m => m.UserId == user.Id && m.IsActive)
            .OrderByDescending(m => m.Role)
            .FirstOrDefaultAsync(ct)
            ?? throw new DomainException(DomainErrors.Forbidden, "This account has no active workspace membership.");

        var workspace = await _db.Workspaces.IgnoreQueryFilters()
            .FirstOrDefaultAsync(w => w.Id == membership.WorkspaceId && w.TenantId == user.TenantId, ct)
            ?? throw new DomainException(DomainErrors.Forbidden, "Workspace is not available.");

        if (workspace.Status != WorkspaceStatus.Active)
            throw new DomainException(DomainErrors.Forbidden, "This workspace is suspended.");

        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstAsync(t => t.Id == user.TenantId, ct);

        _tenant.Set(user.TenantId, workspace.Id, user.Id, membership.Role);

        user.LastLoginAtUtc = DateTime.UtcNow;
        var refresh = await IssueRefreshTokenAsync(user.TenantId, workspace.Id, user.Id, ct);
        await _db.SaveChangesAsync(ct);

        var authUser = new AuthenticatedUser(user.Id, user.TenantId, workspace.Id, user.Email, user.FullName,
            tenant.Name, workspace.Name, membership.Role.ToString(), workspace.CurrencyCode, workspace.TimeZone,
            RolePermissions.For(membership.Role));
        return new AuthResult(authUser, refresh.Token, refresh.ExpiresAtUtc);
    }

    public async Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.CurrentPassword))
            throw new DomainException(DomainErrors.Validation, "Current password is required.");
        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 8)
            throw new DomainException(DomainErrors.Validation, "New password must be at least 8 characters.");
        if (request.NewPassword == request.CurrentPassword)
            throw new DomainException(DomainErrors.Validation, "Choose a password different from the current one.");

        var user = await _db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Account not found.");
        if (!user.IsActive)
            throw new DomainException(DomainErrors.Forbidden, "This account is inactive.");
        if (!PasswordHasher.Verify(request.CurrentPassword, user.PasswordHash))
            throw new DomainException(DomainErrors.Unauthorized, "Current password is incorrect.");

        user.PasswordHash = PasswordHasher.Hash(request.NewPassword);
        user.UpdatedAtUtc = DateTime.UtcNow;

        // Rotating the credential ends every existing session; the client keeps its short-lived
        // access token but cannot refresh it.
        var tokens = await _db.RefreshTokens.IgnoreQueryFilters()
            .Where(t => t.UserId == userId && t.RevokedAtUtc == null)
            .ToListAsync(ct);
        foreach (var token in tokens) token.RevokedAtUtc = DateTime.UtcNow;

        _audit.Record("auth.password_changed", "User", userId.ToString());
        await _db.SaveChangesAsync(ct);
    }

    public async Task<AuthResult> RefreshAsync(string rawToken, CancellationToken ct = default)
    {
        var hash = PasswordHasher.Sha256Hex(rawToken ?? string.Empty);
        var token = await _db.RefreshTokens.IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.TokenHash == hash, ct)
            ?? throw new DomainException(DomainErrors.Unauthorized, "Invalid refresh token.");
        if (token.RevokedAtUtc is not null || token.ExpiresAtUtc <= DateTime.UtcNow)
            throw new DomainException(DomainErrors.Unauthorized, "Refresh token has expired.");

        var user = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == token.UserId && u.TenantId == token.TenantId && u.IsActive, ct)
            ?? throw new DomainException(DomainErrors.Unauthorized, "Account is no longer available.");

        var membership = await _db.Memberships.IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.UserId == user.Id && m.WorkspaceId == token.WorkspaceId && m.IsActive, ct)
            ?? throw new DomainException(DomainErrors.Unauthorized, "Workspace membership is no longer active.");

        var workspace = await _db.Workspaces.IgnoreQueryFilters()
            .FirstAsync(w => w.Id == token.WorkspaceId && w.TenantId == token.TenantId, ct);
        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstAsync(t => t.Id == token.TenantId, ct);

        token.RevokedAtUtc = DateTime.UtcNow;
        _tenant.Set(user.TenantId, workspace.Id, user.Id, membership.Role);
        var next = await IssueRefreshTokenAsync(user.TenantId, workspace.Id, user.Id, ct);
        await _db.SaveChangesAsync(ct);

        var authUser = new AuthenticatedUser(user.Id, user.TenantId, workspace.Id, user.Email, user.FullName,
            tenant.Name, workspace.Name, membership.Role.ToString(), workspace.CurrencyCode, workspace.TimeZone,
            RolePermissions.For(membership.Role));
        return new AuthResult(authUser, next.Token, next.ExpiresAtUtc);
    }

    public async Task LogoutAsync(string rawToken, CancellationToken ct = default)
    {
        var hash = PasswordHasher.Sha256Hex(rawToken ?? string.Empty);
        var token = await _db.RefreshTokens.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is null || token.RevokedAtUtc is not null) return;
        token.RevokedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<WorkspaceOption>> GetWorkspacesAsync(Guid userId, CancellationToken ct = default)
    {
        var memberships = await _db.Memberships.IgnoreQueryFilters()
            .Where(m => m.UserId == userId && m.IsActive)
            .ToListAsync(ct);
        var ids = memberships.Select(m => m.WorkspaceId).ToList();
        var workspaces = await _db.Workspaces.IgnoreQueryFilters().Where(w => ids.Contains(w.Id)).ToListAsync(ct);
        var tenantIds = workspaces.Select(w => w.TenantId).Distinct().ToList();
        var tenants = await _db.Tenants.IgnoreQueryFilters().Where(t => tenantIds.Contains(t.Id)).ToListAsync(ct);

        return memberships.Join(workspaces, m => m.WorkspaceId, w => w.Id, (m, w) => new { m, w })
            .Join(tenants, x => x.w.TenantId, t => t.Id, (x, t) => new WorkspaceOption(
                x.w.Id, x.w.Name, t.Name, x.m.Role.ToString(), x.w.CurrencyCode, x.w.IsPrimary))
            .ToList();
    }

    public async Task<AuthResult> SwitchWorkspaceAsync(Guid userId, Guid workspaceId, CancellationToken ct = default)
    {
        var membership = await _db.Memberships.IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.UserId == userId && m.WorkspaceId == workspaceId && m.IsActive, ct)
            ?? throw new DomainException(DomainErrors.Forbidden, "You do not have access to this workspace.");
        var workspace = await _db.Workspaces.IgnoreQueryFilters()
            .FirstAsync(w => w.Id == workspaceId && w.TenantId == membership.TenantId, ct);
        var user = await _db.Users.IgnoreQueryFilters().FirstAsync(u => u.Id == userId, ct);
        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstAsync(t => t.Id == workspace.TenantId, ct);

        _tenant.Set(workspace.TenantId, workspace.Id, user.Id, membership.Role);
        var refresh = await IssueRefreshTokenAsync(workspace.TenantId, workspace.Id, user.Id, ct);
        await _db.SaveChangesAsync(ct);

        var authUser = new AuthenticatedUser(user.Id, user.TenantId, workspace.Id, user.Email, user.FullName,
            tenant.Name, workspace.Name, membership.Role.ToString(), workspace.CurrencyCode, workspace.TimeZone,
            RolePermissions.For(membership.Role));
        return new AuthResult(authUser, refresh.Token, refresh.ExpiresAtUtc);
    }

    public async Task<AuthenticatedUser> GetMeAsync(Guid userId, Guid tenantId, Guid workspaceId, CancellationToken ct = default)
    {
        var user = await _db.Users.IgnoreQueryFilters()
            .FirstAsync(u => u.Id == userId && u.TenantId == tenantId, ct);
        var membership = await _db.Memberships.IgnoreQueryFilters()
            .FirstAsync(m => m.UserId == userId && m.WorkspaceId == workspaceId && m.IsActive, ct);
        var workspace = await _db.Workspaces.IgnoreQueryFilters().FirstAsync(w => w.Id == workspaceId, ct);
        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstAsync(t => t.Id == tenantId, ct);
        return new AuthenticatedUser(user.Id, tenantId, workspaceId, user.Email, user.FullName, tenant.Name,
            workspace.Name, membership.Role.ToString(), workspace.CurrencyCode, workspace.TimeZone,
            RolePermissions.For(membership.Role));
    }

    private async Task<(string Token, DateTime ExpiresAtUtc)> IssueRefreshTokenAsync(Guid tenantId, Guid workspaceId, Guid userId, CancellationToken ct)
    {
        var raw = PasswordHasher.RandomToken();
        var expires = DateTime.UtcNow.AddDays(_options.RefreshTokenDays);
        _db.RefreshTokens.Add(new RefreshToken
        {
            TenantId = tenantId,
            WorkspaceId = workspaceId,
            UserId = userId,
            TokenHash = PasswordHasher.Sha256Hex(raw),
            ExpiresAtUtc = expires
        });
        await Task.CompletedTask;
        return (raw, expires);
    }

    private async Task<string> UniqueTenantSlugAsync(string name, CancellationToken ct)
    {
        var baseSlug = Slugify(name);
        var slug = baseSlug;
        var i = 1;
        while (await _db.Tenants.IgnoreQueryFilters().AnyAsync(t => t.Slug == slug, ct))
            slug = $"{baseSlug}-{++i}";
        return slug;
    }

    public static string Slugify(string value)
    {
        var slug = Regex.Replace(value.Trim().ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        return string.IsNullOrEmpty(slug) ? "workspace" : slug;
    }
}
