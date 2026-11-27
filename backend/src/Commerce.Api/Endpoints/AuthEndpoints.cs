using System.Security.Claims;
using Commerce.Api.Auth;
using Commerce.Infrastructure.Integrations;
using Commerce.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;

namespace Commerce.Api.Endpoints;

public sealed record AuthResponse(string AccessToken, DateTime AccessTokenExpiresAtUtc, string RefreshToken,
    DateTime RefreshTokenExpiresAtUtc, AuthenticatedUser User);
public sealed record RefreshRequest(string RefreshToken);
public sealed record SwitchWorkspaceRequest(Guid WorkspaceId);
public sealed record HostCodeRequest(string Code);
/// <summary>The answer to a host sign-in code: a session, or "sign in once to link" (<c>linkRequired</c>).</summary>
public sealed record HostSignInResponse(AuthResponse? Session, string ReturnPath, bool LinkRequired, string? HostName,
    string? DisplayName, string? WorkspaceName, string? HostSignInUrl = null);

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/auth").WithTags("Authentication");

        group.MapPost("/register", async (RegisterRequest request, AuthService auth, TokenService tokens, CancellationToken ct) =>
        {
            var result = await auth.RegisterAsync(request, ct);
            return Results.Created("/api/v1/auth/me", Build(result, tokens));
        }).AllowAnonymous().RequireRateLimiting("auth");

        group.MapPost("/login", async (LoginRequest request, AuthService auth, TokenService tokens, CancellationToken ct) =>
        {
            var result = await auth.LoginAsync(request, ct);
            return Results.Ok(Build(result, tokens));
        }).AllowAnonymous().RequireRateLimiting("auth");

        group.MapPost("/refresh", async (RefreshRequest request, AuthService auth, TokenService tokens, CancellationToken ct) =>
        {
            var result = await auth.RefreshAsync(request.RefreshToken, ct);
            return Results.Ok(Build(result, tokens));
        }).AllowAnonymous().RequireRateLimiting("auth");

        group.MapPost("/logout", async (RefreshRequest request, AuthService auth, CancellationToken ct) =>
        {
            await auth.LogoutAsync(request.RefreshToken, ct);
            return Results.NoContent();
        }).AllowAnonymous();

        group.MapGet("/me", async (ClaimsPrincipal user, AuthService auth, CancellationToken ct) =>
        {
            var me = await auth.GetMeAsync(UserId(user), TenantId(user), WorkspaceId(user), ct);
            return Results.Ok(me);
        }).RequireAuthorization("Member");

        group.MapGet("/workspaces", async (ClaimsPrincipal user, AuthService auth, CancellationToken ct) =>
            Results.Ok(await auth.GetWorkspacesAsync(UserId(user), ct)))
            .RequireAuthorization("Member");

        group.MapPost("/switch-workspace", async (SwitchWorkspaceRequest request, ClaimsPrincipal user,
            AuthService auth, TokenService tokens, CancellationToken ct) =>
        {
            var result = await auth.SwitchWorkspaceAsync(UserId(user), request.WorkspaceId, ct);
            return Results.Ok(Build(result, tokens));
        }).RequireAuthorization("Member");

        group.MapGet("/sso/status", (Microsoft.Extensions.Options.IOptions<Commerce.Infrastructure.Options.IntegrationOptions> options) =>
            Results.Ok(new
            {
                enabled = !string.IsNullOrWhiteSpace(options.Value.ProvisioningSecret),
                mode = "host-launch",
                note = "Signing in from the host platform uses a signed, single-use code. A host person is signed in only " +
                       "as the Commerce account they linked by signing in to it once, and only while that account is an " +
                       "active member of the connected workspace — or, where the host's signed provisioning turned on " +
                       "auto-provisioning, as an account created on their first launch (audited; the host's role sets " +
                       "only that account's first role). An existing email is never taken over."
            }))
            .AllowAnonymous();

        group.MapPost("/sso/redeem", async (HostCodeRequest request, HostSignInService signIn, TokenService tokens,
            HttpContext context, CancellationToken ct) =>
        {
            var result = await signIn.RedeemAsync(request.Code, ct);
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new HostSignInResponse(result.Auth is null ? null : Build(result.Auth, tokens),
                result.ReturnPath, result.LinkRequired, result.HostName, result.DisplayName, result.WorkspaceName,
                result.HostSignInUrl));
        }).AllowAnonymous().RequireRateLimiting("auth");

        group.MapPost("/sso/link", async (HostCodeRequest request, ClaimsPrincipal user, HostSignInService signIn,
            TokenService tokens, HttpContext context, CancellationToken ct) =>
        {
            var result = await signIn.LinkAsync(request.Code, UserId(user), ct);
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new HostSignInResponse(Build(result.Auth!, tokens), result.ReturnPath, false,
                result.HostName, null, result.WorkspaceName, result.HostSignInUrl));
        }).RequireAuthorization("Member").RequireRateLimiting("auth");
    }

    private static AuthResponse Build(AuthResult result, TokenService tokens)
    {
        var (accessToken, expires) = tokens.CreateAccessToken(result.User);
        return new AuthResponse(accessToken, expires, result.RefreshToken, result.RefreshTokenExpiresAtUtc, result.User);
    }

    public static Guid UserId(ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public static Guid TenantId(ClaimsPrincipal user) => Guid.Parse(user.FindFirstValue("tid")!);
    public static Guid WorkspaceId(ClaimsPrincipal user) => Guid.Parse(user.FindFirstValue("wid")!);
}

public static class Policies
{
    public static void Configure(AuthorizationOptions options)
    {
        options.AddPolicy("Member", p => p.RequireAuthenticatedUser()
            .RequireRole("Owner", "Admin", "Manager", "Staff", "Viewer"));
        options.AddPolicy("Staff", p => p.RequireAuthenticatedUser()
            .RequireRole("Owner", "Admin", "Manager", "Staff"));
        options.AddPolicy("Manager", p => p.RequireAuthenticatedUser()
            .RequireRole("Owner", "Admin", "Manager"));
        options.AddPolicy("Admin", p => p.RequireAuthenticatedUser()
            .RequireRole("Owner", "Admin"));

        foreach (var scope in IntegrationScopes.All)
        {
            options.AddPolicy($"scope:{scope}", p => p
                .AddAuthenticationSchemes(ApiKeyAuthenticationHandler.SchemeName)
                .RequireAuthenticatedUser()
                .RequireClaim("scope", scope));
        }
    }
}
