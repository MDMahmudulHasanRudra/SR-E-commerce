using System.Security.Claims;
using System.Text.Encodings.Web;
using Commerce.Infrastructure.Integrations;
using Commerce.Infrastructure.Abstractions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Commerce.Api.Auth;

/// <summary>Authenticates machine-to-machine integration requests using hashed, scoped, revocable API keys.</summary>
public sealed class ApiKeyAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "ApiKey";

    public ApiKeyAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder) : base(options, logger, encoder)
    {
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue("X-Api-Key", out var values) || string.IsNullOrWhiteSpace(values.ToString()))
            return AuthenticateResult.Fail("An API key is required.");

        var keys = Context.RequestServices.GetRequiredService<ApiKeyService>();
        var result = await keys.AuthenticateAsync(values.ToString(), Context.RequestAborted);
        if (result.Identity is null)
            return AuthenticateResult.Fail(result.Error ?? "Invalid API key.");

        var tenant = Context.RequestServices.GetRequiredService<TenantContext>();
        tenant.Set(result.Identity.TenantId, result.Identity.WorkspaceId, null, null);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, result.Identity.ClientId.ToString()),
            new(ClaimTypes.Name, result.Identity.Name),
            new("tid", result.Identity.TenantId.ToString()),
            new("wid", result.Identity.WorkspaceId.ToString()),
            new("client_id", result.Identity.ClientId.ToString())
        };
        claims.AddRange(result.Identity.Scopes.Select(s => new Claim("scope", s)));

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        return AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName));
    }
}
