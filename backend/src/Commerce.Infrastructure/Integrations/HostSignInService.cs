using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Identity;
using Commerce.Domain.Integrations;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Security;
using Commerce.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Integrations;

/// <summary>Signed by the host with the provisioning secret. The host never sends its own user id, only a
/// pseudonymous subject that is stable for one person in one host project.</summary>
public sealed record HostLaunchRequest(
    string HostPlatform,
    string HostCustomerId,
    string HostProjectId,
    string Subject,
    string? DisplayName,
    string? ReturnPath,
    string? Email = null,
    string? Role = null,
    bool? AutoProvision = null);

/// <summary><c>launchPath</c> is relative to the Commerce dashboard's own address; the code travels in the
/// fragment so it never reaches a server log or a referrer.</summary>
public sealed record HostLaunchResult(string Mode, string LaunchPath, DateTime ExpiresAtUtc);

public sealed record HostRedeemResult(AuthResult? Auth, string ReturnPath, bool LinkRequired, string? HostName,
    string? DisplayName, string? WorkspaceName, string? HostSignInUrl = null);

/// <summary>
/// Signing in from the host platform. The host proves who is asking (provisioning HMAC) and for which project;
/// Commerce decides who that person is here. A person is signed in only through a link they made themselves
/// by signing in to their Commerce account once — or, only where the host's signed provisioning set the
/// connection's AutoProvisionMembers policy and the launch asks for it, an account and membership created for
/// them on their first launch (audited; see <see cref="TryAutoProvisionAsync"/>). Every sign-in re-checks the
/// connection, the workspace, the user and the membership.
/// </summary>
public sealed class HostSignInService
{
    public static readonly TimeSpan SignInLifetime = TimeSpan.FromMinutes(2);
    public static readonly TimeSpan LinkLifetime = TimeSpan.FromMinutes(5);

    private readonly CommerceDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly AuthService _auth;
    private readonly AuditService _audit;

    public HostSignInService(CommerceDbContext db, ITenantContext tenant, AuthService auth, AuditService audit)
    {
        _db = db;
        _tenant = tenant;
        _auth = auth;
        _audit = audit;
    }

    public async Task<HostLaunchResult> CreateLaunchAsync(HostLaunchRequest request, CancellationToken ct = default)
    {
        var hostPlatform = string.IsNullOrWhiteSpace(request.HostPlatform) ? "Get Assist" : request.HostPlatform.Trim();
        var hostCustomer = request.HostCustomerId?.Trim();
        var hostProject = request.HostProjectId?.Trim();
        var subject = request.Subject?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(hostCustomer) || string.IsNullOrWhiteSpace(hostProject))
            throw new DomainException(DomainErrors.Validation, "HostCustomerId and HostProjectId are required.");
        if (subject.Length is < 16 or > 128 || !subject.All(char.IsAsciiLetterOrDigit))
            throw new DomainException(DomainErrors.Validation, "Subject must be 16-128 letters or digits.");

        var connection = await _db.AppConnections.IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.HostPlatform == hostPlatform
                && c.HostCustomerId == hostCustomer && c.HostProjectId == hostProject, ct)
            ?? throw new DomainException(DomainErrors.Forbidden, "This host project is not connected to Commerce.");
        await EnsureUsableAsync(connection, ct);

        var link = await _db.HostIdentityLinks.IgnoreQueryFilters()
            .FirstOrDefaultAsync(l => l.ConnectionId == connection.Id && l.Subject == subject, ct);
        Guid? userId = null;
        if (link is not null && await HasActiveMembershipAsync(link.UserId, connection, ct))
            userId = link.UserId;
        else if (link is null && connection.AutoProvisionMembers && request.AutoProvision == true)
            userId = await TryAutoProvisionAsync(connection, subject, request, ct);

        var kind = userId is null ? HostLaunchKind.Link : HostLaunchKind.SignIn;
        var code = PasswordHasher.RandomToken(32);
        var expires = DateTime.UtcNow.Add(kind == HostLaunchKind.SignIn ? SignInLifetime : LinkLifetime);
        _db.HostLaunchCodes.Add(new HostLaunchCode
        {
            TenantId = connection.TenantId,
            WorkspaceId = connection.WorkspaceId,
            ConnectionId = connection.Id,
            CodeHash = PasswordHasher.Sha256Hex(code),
            Kind = kind,
            UserId = userId,
            Subject = subject,
            DisplayName = Clip(request.DisplayName, 120),
            ReturnPath = SafeReturnPath(request.ReturnPath),
            ExpiresAtUtc = expires
        });
        // Expired codes are useless; drop them as new ones are made rather than running a sweeper.
        await _db.HostLaunchCodes.IgnoreQueryFilters()
            .Where(c => c.ExpiresAtUtc < DateTime.UtcNow.AddHours(-1)).ExecuteDeleteAsync(ct);
        await _db.SaveChangesAsync(ct);

        return new HostLaunchResult(kind == HostLaunchKind.SignIn ? "signIn" : "link",
            $"/sso/launch#code={code}", expires);
    }

    /// <summary>
    /// The browser presents the code. A sign-in code is spent and becomes a normal Commerce session for the
    /// connection's workspace. A link code is NOT spent here: it only tells the page to ask for the person's
    /// Commerce sign-in, which <see cref="LinkAsync"/> then completes.
    /// </summary>
    public async Task<HostRedeemResult> RedeemAsync(string rawCode, CancellationToken ct = default)
    {
        var code = await FindLiveCodeAsync(rawCode, ct);
        var connection = await LoadConnectionAsync(code, ct);
        await EnsureUsableAsync(connection, ct);
        var workspace = await _db.Workspaces.IgnoreQueryFilters().FirstAsync(w => w.Id == connection.WorkspaceId, ct);

        if (code.Kind == HostLaunchKind.Link)
            return new HostRedeemResult(null, code.ReturnPath, true, connection.HostPlatform, code.DisplayName, workspace.Name,
                connection.HostSignInUrl);

        await SpendAsync(code, ct);
        var userId = code.UserId ?? throw Expired();
        var link = await _db.HostIdentityLinks.IgnoreQueryFilters()
            .FirstOrDefaultAsync(l => l.ConnectionId == connection.Id && l.Subject == code.Subject && l.UserId == userId, ct);
        if (link is null || !await HasActiveMembershipAsync(userId, connection, ct))
            throw new DomainException(DomainErrors.Forbidden,
                "Your Commerce access to this workspace has ended. Ask a workspace admin to restore it.");

        var result = await _auth.SwitchWorkspaceAsync(userId, connection.WorkspaceId, ct);
        link.LastSignInAtUtc = DateTime.UtcNow;
        _tenant.Set(connection.TenantId, connection.WorkspaceId, userId, null);
        _audit.Record("integration.host_sign_in", "CommerceUser", userId.ToString(), connection.HostPlatform);
        await _db.SaveChangesAsync(ct);
        return new HostRedeemResult(result, code.ReturnPath, false, connection.HostPlatform, null, workspace.Name,
            connection.HostSignInUrl);
    }

    /// <summary>
    /// Completes a link: the caller has just signed in to Commerce (its access token is the proof), so this
    /// host person may sign in as that Commerce user from now on — only while that user is an active member
    /// of the connection's workspace.
    /// </summary>
    public async Task<HostRedeemResult> LinkAsync(string rawCode, Guid userId, CancellationToken ct = default)
    {
        var code = await FindLiveCodeAsync(rawCode, ct);
        if (code.Kind != HostLaunchKind.Link) throw Expired();
        var connection = await LoadConnectionAsync(code, ct);
        await EnsureUsableAsync(connection, ct);
        if (!await HasActiveMembershipAsync(userId, connection, ct))
            throw new DomainException(DomainErrors.Forbidden,
                "This Commerce account is not a member of the workspace connected to this project.");

        await SpendAsync(code, ct);
        // One host person ↔ one Commerce user per connection. Re-linking moves the link; nothing else changes.
        await _db.HostIdentityLinks.IgnoreQueryFilters()
            .Where(l => l.ConnectionId == connection.Id && (l.Subject == code.Subject || l.UserId == userId))
            .ExecuteDeleteAsync(ct);
        _db.HostIdentityLinks.Add(new HostIdentityLink
        {
            TenantId = connection.TenantId,
            WorkspaceId = connection.WorkspaceId,
            ConnectionId = connection.Id,
            Subject = code.Subject,
            UserId = userId,
            LastSignInAtUtc = DateTime.UtcNow
        });
        var result = await _auth.SwitchWorkspaceAsync(userId, connection.WorkspaceId, ct);
        _tenant.Set(connection.TenantId, connection.WorkspaceId, userId, null);
        _audit.Record("integration.host_identity_linked", "CommerceUser", userId.ToString(),
            $"{connection.HostPlatform}{(code.DisplayName is null ? "" : $" user {code.DisplayName}")}");
        await _db.SaveChangesAsync(ct);
        var workspace = await _db.Workspaces.IgnoreQueryFilters().FirstAsync(w => w.Id == connection.WorkspaceId, ct);
        return new HostRedeemResult(result, code.ReturnPath, false, connection.HostPlatform, null, workspace.Name,
            connection.HostSignInUrl);
    }

    /// <summary>
    /// The host's auto-provision policy, for a person the host sends here for the first time. Returns the user to
    /// sign in, or null to fall back to linking. Deliberately narrow:
    /// <list type="bullet">
    /// <item>A person this connection created before (ExternalIssuer + ExternalSubject) is linked again only while
    /// they are still an active member: a workspace admin who removed someone is never overruled.</item>
    /// <item>An email that already belongs to any Commerce account is never taken over: the host's email is not
    /// verified here, so that person links their existing account once, as before.</item>
    /// <item>The host's role is used only when the account is created: OWNER → Owner for the workspace's first
    /// one, else Admin; anyone else → Staff. Later changes are made in Commerce.</item>
    /// </list>
    /// The new account has a random, unusable password: it opens only through the host.
    /// </summary>
    private async Task<Guid?> TryAutoProvisionAsync(AppConnection connection, string subject, HostLaunchRequest request,
        CancellationToken ct)
    {
        var issuer = $"host:{connection.Id:N}";
        var known = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.TenantId == connection.TenantId && u.ExternalIssuer == issuer
                && u.ExternalSubject == subject, ct);
        Guid userId;
        if (known is not null)
        {
            if (!await HasActiveMembershipAsync(known.Id, connection, ct)) return null;
            userId = known.Id;
        }
        else
        {
            var email = NormalizeEmail(request.Email) ?? $"{subject[..Math.Min(24, subject.Length)].ToLowerInvariant()}@{issuer[5..17]}.host.invalid";
            if (await _db.Users.IgnoreQueryFilters().AnyAsync(u => u.NormalizedEmail == email, ct)) return null;

            var wantsOwner = string.Equals(request.Role, "OWNER", StringComparison.OrdinalIgnoreCase);
            var role = !wantsOwner ? UserRole.Staff
                : await _db.Memberships.IgnoreQueryFilters().AnyAsync(m => m.WorkspaceId == connection.WorkspaceId
                    && m.TenantId == connection.TenantId && m.IsActive && m.Role == UserRole.Owner, ct)
                    ? UserRole.Admin : UserRole.Owner;
            var name = Clip(request.DisplayName, 120) ?? email;
            userId = Guid.NewGuid();
            _db.Users.Add(new CommerceUser
            {
                Id = userId,
                TenantId = connection.TenantId,
                Email = email,
                NormalizedEmail = email,
                FullName = name,
                PasswordHash = PasswordHasher.Hash(PasswordHasher.RandomToken(48)),
                ExternalIssuer = issuer,
                ExternalSubject = subject
            });
            _db.Memberships.Add(new CommerceMembership
            {
                TenantId = connection.TenantId,
                WorkspaceId = connection.WorkspaceId,
                UserId = userId,
                Role = role
            });
            _tenant.Set(connection.TenantId, connection.WorkspaceId, null, null);
            _audit.Record("integration.member_auto_provisioned", "CommerceUser", userId.ToString(),
                $"{connection.HostPlatform}: {name} as {role}");
        }

        _db.HostIdentityLinks.Add(new HostIdentityLink
        {
            TenantId = connection.TenantId,
            WorkspaceId = connection.WorkspaceId,
            ConnectionId = connection.Id,
            Subject = subject,
            UserId = userId
        });
        return userId;
    }

    private static string? NormalizeEmail(string? raw)
    {
        var email = raw?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(email) || email.Length > 254 || email.Any(char.IsWhiteSpace) || email.Any(char.IsControl)) return null;
        var at = email.IndexOf('@');
        return at > 0 && at == email.LastIndexOf('@') && email.IndexOf('.', at) > at + 1 && !email.EndsWith('.') ? email : null;
    }

    private async Task<HostLaunchCode> FindLiveCodeAsync(string rawCode, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(rawCode) || rawCode.Length > 128) throw Expired();
        var hash = PasswordHasher.Sha256Hex(rawCode);
        var code = await _db.HostLaunchCodes.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.CodeHash == hash, ct);
        if (code is null || code.UsedAtUtc is not null || code.ExpiresAtUtc <= DateTime.UtcNow) throw Expired();
        return code;
    }

    /// <summary>A conditional update: two presentations of one code cannot both win.</summary>
    private async Task SpendAsync(HostLaunchCode code, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var spent = await _db.HostLaunchCodes.IgnoreQueryFilters()
            .Where(c => c.Id == code.Id && c.UsedAtUtc == null && c.ExpiresAtUtc > now)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.UsedAtUtc, now), ct);
        if (spent != 1) throw Expired();
    }

    private async Task<AppConnection> LoadConnectionAsync(HostLaunchCode code, CancellationToken ct) =>
        await _db.AppConnections.IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == code.ConnectionId && c.WorkspaceId == code.WorkspaceId
                && c.TenantId == code.TenantId, ct)
        ?? throw new DomainException(DomainErrors.Forbidden, "This host project is no longer connected to Commerce.");

    private async Task EnsureUsableAsync(AppConnection connection, CancellationToken ct)
    {
        if (connection.Status != ConnectionStatus.Active)
            throw new DomainException(DomainErrors.Forbidden, "The connection to the host platform is not active.");
        var workspace = await _db.Workspaces.IgnoreQueryFilters()
            .FirstOrDefaultAsync(w => w.Id == connection.WorkspaceId && w.TenantId == connection.TenantId, ct);
        if (workspace is null || workspace.Status != WorkspaceStatus.Active)
            throw new DomainException(DomainErrors.Forbidden, "This Commerce workspace is suspended.");
    }

    private async Task<bool> HasActiveMembershipAsync(Guid userId, AppConnection connection, CancellationToken ct)
    {
        var userActive = await _db.Users.IgnoreQueryFilters()
            .AnyAsync(u => u.Id == userId && u.TenantId == connection.TenantId && u.IsActive, ct);
        return userActive && await _db.Memberships.IgnoreQueryFilters()
            .AnyAsync(m => m.UserId == userId && m.WorkspaceId == connection.WorkspaceId
                && m.TenantId == connection.TenantId && m.IsActive, ct);
    }

    /// <summary>Only a plain path inside this app: never another origin, a scheme or a protocol-relative path.</summary>
    public static string SafeReturnPath(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "/dashboard";
        var path = raw.Trim();
        if (path.Length > 300 || !path.StartsWith('/') || path.StartsWith("//") || path.Contains('\\')
            || path.Any(char.IsControl) || path.StartsWith("/sso") || path.StartsWith("/login"))
            return "/dashboard";
        return path;
    }

    private static string? Clip(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = new string(value.Trim().Where(ch => !char.IsControl(ch)).ToArray());
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }

    private static DomainException Expired() =>
        new(DomainErrors.Unauthorized, "This sign-in link has expired or was already used. Open Commerce again from the host platform.");
}
