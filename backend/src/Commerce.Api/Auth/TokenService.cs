using System.Security.Claims;
using System.Text;
using Commerce.Infrastructure.Options;
using Commerce.Infrastructure.Services;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Commerce.Api.Auth;

public sealed class TokenService
{
    private readonly AuthOptions _options;
    private readonly SymmetricSecurityKey _key;

    public TokenService(IOptions<AuthOptions> options, SigningKeyProvider keyProvider)
    {
        _options = options.Value;
        _key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keyProvider.Key));
    }

    public (string Token, DateTime ExpiresAtUtc) CreateAccessToken(AuthenticatedUser user)
    {
        var expires = DateTime.UtcNow.AddMinutes(Math.Clamp(_options.AccessTokenMinutes, 5, 240));
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.UserId.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new("name", user.FullName),
            new("role", user.Role),
            new("tid", user.TenantId.ToString()),
            new("wid", user.WorkspaceId.ToString()),
            new("company", user.CompanyName),
            new("workspace", user.WorkspaceName),
            new("currency", user.CurrencyCode)
        };
        foreach (var permission in user.Permissions) claims.Add(new Claim("permission", permission));

        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expires,
            Issuer = _options.Issuer,
            Audience = _options.Audience,
            SigningCredentials = new SigningCredentials(_key, SecurityAlgorithms.HmacSha256)
        };
        var handler = new JsonWebTokenHandler();
        return (handler.CreateToken(descriptor), expires);
    }
}

public sealed class SigningKeyProvider
{
    public SigningKeyProvider(IOptions<AuthOptions> options, ILogger<SigningKeyProvider> logger)
    {
        if (!string.IsNullOrWhiteSpace(options.Value.SigningKey) && options.Value.SigningKey.Length >= 32)
        {
            Key = options.Value.SigningKey;
            return;
        }

        Key = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48));
        logger.LogWarning("No strong Auth:SigningKey configured. Using an ephemeral signing key; " +
                          "tokens will be invalid after restart. Configure Auth__SigningKey in production.");
    }

    public string Key { get; }
}
