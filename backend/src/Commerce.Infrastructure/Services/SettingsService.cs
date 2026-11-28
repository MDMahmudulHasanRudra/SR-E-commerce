using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Identity;
using Commerce.Domain.Payments;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Services;

public sealed record CompanySettingsView(Guid TenantId, string CompanyName, string TenantSlug,
    Guid WorkspaceId, string WorkspaceName, string CurrencyCode, string TimeZone, string Status,
    string ApiContractVersion, DateTime CreatedAtUtc);
public sealed record UpdateCompanySettingsInput(string CompanyName, string WorkspaceName,
    string CurrencyCode, string TimeZone);
public sealed record CreateWorkspaceInput(string Name, string CurrencyCode, string TimeZone);
public sealed record TeamMemberView(Guid UserId, string Email, string FullName, string Role, bool IsActive,
    DateTime? LastLoginAtUtc, DateTime CreatedAtUtc);
public sealed record CreateTeamMemberInput(string FullName, string Email, string Password, UserRole Role);
public sealed record UpdateTeamMemberInput(UserRole Role, bool IsActive);
public sealed record TaxRateInput(string Name, decimal Rate, bool IsDefault, bool IsInclusive);
public sealed record TaxRateView(Guid Id, string Name, decimal Rate, bool IsDefault, bool IsInclusive);
public sealed record AuditLogView(Guid Id, string Action, string EntityType, string EntityId, string? Details,
    Guid? UserId, string? UserName, DateTime CreatedAtUtc);

public sealed class SettingsService
{
    private readonly CommerceDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly AuditService _audit;

    public SettingsService(CommerceDbContext db, ITenantContext tenant, AuditService audit)
    {
        _db = db;
        _tenant = tenant;
        _audit = audit;
    }

    public async Task<CompanySettingsView> GetCompanyAsync(CancellationToken ct = default)
    {
        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstAsync(t => t.Id == _db.CurrentTenantId, ct);
        var workspace = await _db.Workspaces.AsNoTracking().FirstAsync(w => w.Id == _db.CurrentWorkspaceId, ct);
        return new CompanySettingsView(tenant.Id, tenant.Name, tenant.Slug, workspace.Id, workspace.Name,
            workspace.CurrencyCode, workspace.TimeZone, workspace.Status.ToString(), "v1", tenant.CreatedAtUtc);
    }

    public async Task<CompanySettingsView> UpdateCompanyAsync(UpdateCompanySettingsInput input, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(input.CompanyName) || string.IsNullOrWhiteSpace(input.WorkspaceName))
            throw new DomainException(DomainErrors.Validation, "Company and workspace names are required.");
        if (string.IsNullOrWhiteSpace(input.CurrencyCode) || input.CurrencyCode.Trim().Length != 3)
            throw new DomainException(DomainErrors.Validation, "Use a three-letter currency code (for example USD).");

        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstAsync(t => t.Id == _db.CurrentTenantId, ct);
        var workspace = await _db.Workspaces.FirstAsync(w => w.Id == _db.CurrentWorkspaceId, ct);
        tenant.Name = input.CompanyName.Trim();
        workspace.Name = input.WorkspaceName.Trim();
        workspace.CurrencyCode = input.CurrencyCode.Trim().ToUpperInvariant();
        workspace.TimeZone = string.IsNullOrWhiteSpace(input.TimeZone) ? "UTC" : input.TimeZone.Trim();
        _audit.Record("settings.updated", "Workspace", workspace.Id.ToString(), workspace.Name);
        await _db.SaveChangesAsync(ct);
        return await GetCompanyAsync(ct);
    }

    public async Task<IReadOnlyList<TeamMemberView>> ListTeamAsync(CancellationToken ct = default)
    {
        var memberships = await _db.Memberships.AsNoTracking().Where(m => m.WorkspaceId == _db.CurrentWorkspaceId).ToListAsync(ct);
        var userIds = memberships.Select(m => m.UserId).ToList();
        var users = await _db.Users.IgnoreQueryFilters().Where(u => userIds.Contains(u.Id)).ToListAsync(ct);
        return memberships.Join(users, m => m.UserId, u => u.Id, (m, u) => new TeamMemberView(
            u.Id, u.Email, u.FullName, m.Role.ToString(), m.IsActive && u.IsActive, u.LastLoginAtUtc, u.CreatedAtUtc))
            .OrderByDescending(m => m.Role).ThenBy(m => m.FullName).ToList();
    }

    public async Task<TeamMemberView> CreateTeamMemberAsync(CreateTeamMemberInput input, CancellationToken ct = default)
    {
        var email = input.Email?.Trim().ToLowerInvariant() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(input.FullName))
            throw new DomainException(DomainErrors.Validation, "Full name is required.");
        if (!email.Contains('@'))
            throw new DomainException(DomainErrors.Validation, "A valid email address is required.");
        if (string.IsNullOrWhiteSpace(input.Password) || input.Password.Length < 8)
            throw new DomainException(DomainErrors.Validation, "Password must be at least 8 characters.");
        if (input.Role == UserRole.Owner && _tenant.Role != UserRole.Owner)
            throw new DomainException(DomainErrors.Forbidden, "Only the owner can assign the owner role.");
        if (await _db.Users.IgnoreQueryFilters().AnyAsync(u => u.NormalizedEmail == email, ct))
            throw new DomainException(DomainErrors.Conflict, "A user with this email already exists.");

        var user = new CommerceUser
        {
            TenantId = _db.CurrentTenantId,
            Email = email,
            NormalizedEmail = email,
            FullName = input.FullName.Trim(),
            PasswordHash = PasswordHasher.Hash(input.Password),
            IsActive = true
        };
        _db.Users.Add(user);
        _db.Memberships.Add(new CommerceMembership
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            UserId = user.Id,
            Role = input.Role,
            IsActive = true
        });
        _audit.Record("team.member_invited", "User", user.Id.ToString(), email);
        await _db.SaveChangesAsync(ct);
        return new TeamMemberView(user.Id, user.Email, user.FullName, input.Role.ToString(), true, null, user.CreatedAtUtc);
    }

    public async Task<TeamMemberView> UpdateTeamMemberAsync(Guid userId, UpdateTeamMemberInput input, CancellationToken ct = default)
    {
        var membership = await _db.Memberships.FirstOrDefaultAsync(m =>
            m.UserId == userId && m.WorkspaceId == _db.CurrentWorkspaceId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Team member not found.");
        if (membership.Role == UserRole.Owner && _tenant.Role != UserRole.Owner)
            throw new DomainException(DomainErrors.Forbidden, "Only the owner can change the owner account.");
        if (input.Role == UserRole.Owner && _tenant.Role != UserRole.Owner)
            throw new DomainException(DomainErrors.Forbidden, "Only the owner can assign the owner role.");
        if (userId == _tenant.UserId && !input.IsActive)
            throw new DomainException(DomainErrors.Validation, "You cannot deactivate your own account.");

        var user = await _db.Users.IgnoreQueryFilters().FirstAsync(u => u.Id == userId && u.TenantId == _db.CurrentTenantId, ct);
        membership.Role = input.Role;
        membership.IsActive = input.IsActive;
        user.IsActive = input.IsActive;
        _audit.Record("team.member_updated", "User", user.Id.ToString(), $"{input.Role} / active={input.IsActive}");
        await _db.SaveChangesAsync(ct);
        return new TeamMemberView(user.Id, user.Email, user.FullName, membership.Role.ToString(),
            membership.IsActive, user.LastLoginAtUtc, user.CreatedAtUtc);
    }

    public async Task<IReadOnlyList<TaxRateView>> ListTaxRatesAsync(CancellationToken ct = default) =>
        await _db.TaxRates.AsNoTracking().OrderByDescending(t => t.IsDefault).ThenBy(t => t.Name)
            .Select(t => new TaxRateView(t.Id, t.Name, t.Rate, t.IsDefault, t.IsInclusive)).ToListAsync(ct);

    public async Task<TaxRateView> CreateTaxRateAsync(TaxRateInput input, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(input.Name))
            throw new DomainException(DomainErrors.Validation, "Tax name is required.");
        if (input.Rate < 0 || input.Rate > 100)
            throw new DomainException(DomainErrors.Validation, "Tax rate must be between 0 and 100.");

        if (input.IsDefault)
            foreach (var existing in await _db.TaxRates.Where(t => t.IsDefault).ToListAsync(ct)) existing.IsDefault = false;

        var tax = new TaxRate
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            Name = input.Name.Trim(),
            Rate = input.Rate,
            IsDefault = input.IsDefault,
            IsInclusive = input.IsInclusive
        };
        _db.TaxRates.Add(tax);
        await _db.SaveChangesAsync(ct);
        return new TaxRateView(tax.Id, tax.Name, tax.Rate, tax.IsDefault, tax.IsInclusive);
    }

    public async Task<TaxRateView> UpdateTaxRateAsync(Guid id, TaxRateInput input, CancellationToken ct = default)
    {
        var tax = await _db.TaxRates.FirstOrDefaultAsync(t => t.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Tax rate not found.");
        if (input.Rate < 0 || input.Rate > 100)
            throw new DomainException(DomainErrors.Validation, "Tax rate must be between 0 and 100.");
        if (input.IsDefault && !tax.IsDefault)
            foreach (var existing in await _db.TaxRates.Where(t => t.IsDefault).ToListAsync(ct)) existing.IsDefault = false;

        tax.Name = input.Name.Trim();
        tax.Rate = input.Rate;
        tax.IsDefault = input.IsDefault;
        tax.IsInclusive = input.IsInclusive;
        await _db.SaveChangesAsync(ct);
        return new TaxRateView(tax.Id, tax.Name, tax.Rate, tax.IsDefault, tax.IsInclusive);
    }

    public async Task DeleteTaxRateAsync(Guid id, CancellationToken ct = default)
    {
        var tax = await _db.TaxRates.FirstOrDefaultAsync(t => t.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Tax rate not found.");
        if (tax.IsDefault)
            throw new DomainException(DomainErrors.Conflict, "Choose another default tax rate first.");
        _db.TaxRates.Remove(tax);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<PagedResult<AuditLogView>> ListAuditLogsAsync(string? search, int page, int pageSize,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = _db.AuditLogs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(l => l.Action.ToLower().Contains(term) || l.EntityType.ToLower().Contains(term)
                || (l.Details != null && l.Details.ToLower().Contains(term)));
        }
        var total = await query.CountAsync(ct);
        var logs = await query.OrderByDescending(l => l.CreatedAtUtc).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var userIds = logs.Where(l => l.UserId != null).Select(l => l.UserId!.Value).Distinct().ToList();
        var names = await _db.Users.IgnoreQueryFilters().Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName, ct);
        var items = logs.Select(l => new AuditLogView(l.Id, l.Action, l.EntityType, l.EntityId, l.Details,
            l.UserId, l.UserId is not null ? names.GetValueOrDefault(l.UserId.Value) : null, l.CreatedAtUtc)).ToList();
        return new PagedResult<AuditLogView>(items, page, pageSize, total);
    }

    public async Task<IReadOnlyList<CompanySettingsView>> ListWorkspacesAsync(CancellationToken ct = default)
    {
        var workspaces = await _db.Workspaces.AsNoTracking().Where(w => w.TenantId == _db.CurrentTenantId).ToListAsync(ct);
        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstAsync(t => t.Id == _db.CurrentTenantId, ct);
        return workspaces.Select(w => new CompanySettingsView(tenant.Id, tenant.Name, tenant.Slug, w.Id, w.Name,
            w.CurrencyCode, w.TimeZone, w.Status.ToString(), "v1", tenant.CreatedAtUtc)).ToList();
    }

    /// <summary>Creates a branch (workspace) in the current tenant and gives the caller access to it.</summary>
    public async Task<CompanySettingsView> CreateWorkspaceAsync(CreateWorkspaceInput input, CancellationToken ct = default)
    {
        var name = input.Name?.Trim() ?? string.Empty;
        if (name.Length < 2)
            throw new DomainException(DomainErrors.Validation, "Workspace name is required.");
        var currency = string.IsNullOrWhiteSpace(input.CurrencyCode)
            ? "USD"
            : input.CurrencyCode.Trim().ToUpperInvariant();
        if (currency.Length != 3)
            throw new DomainException(DomainErrors.Validation, "Use a three-letter currency code (for example USD).");

        var workspace = new CommerceWorkspace
        {
            TenantId = _db.CurrentTenantId,
            Name = name,
            Slug = await UniqueWorkspaceSlugAsync(name, ct),
            CurrencyCode = currency,
            TimeZone = string.IsNullOrWhiteSpace(input.TimeZone) ? "UTC" : input.TimeZone.Trim(),
            IsPrimary = false
        };
        _db.Workspaces.Add(workspace);
        _db.Memberships.Add(new CommerceMembership
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = workspace.Id,
            UserId = _tenant.UserId ?? throw new DomainException(DomainErrors.Unauthorized, "No signed-in user."),
            Role = _tenant.Role ?? UserRole.Viewer,
            IsActive = true
        });
        _db.Warehouses.Add(new Commerce.Domain.Inventory.Warehouse
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = workspace.Id,
            Name = "Main Warehouse",
            Code = "MAIN",
            IsDefault = true
        });
        _audit.Record("settings.workspace_created", "Workspace", workspace.Id.ToString(), workspace.Name);
        await _db.SaveChangesAsync(ct);

        var tenant = await _db.Tenants.IgnoreQueryFilters().FirstAsync(t => t.Id == _db.CurrentTenantId, ct);
        return new CompanySettingsView(tenant.Id, tenant.Name, tenant.Slug, workspace.Id, workspace.Name,
            workspace.CurrencyCode, workspace.TimeZone, workspace.Status.ToString(), "v1", tenant.CreatedAtUtc);
    }

    private async Task<string> UniqueWorkspaceSlugAsync(string name, CancellationToken ct)
    {
        var baseSlug = AuthService.Slugify(name);
        var slug = baseSlug;
        var i = 1;
        while (await _db.Workspaces.IgnoreQueryFilters()
                   .AnyAsync(w => w.TenantId == _db.CurrentTenantId && w.Slug == slug, ct))
            slug = $"{baseSlug}-{++i}";
        return slug;
    }
}
