namespace Commerce.Infrastructure.Options;

public sealed class AuthOptions
{
    public string Issuer { get; set; } = "commerce";
    public string Audience { get; set; } = "commerce-api";
    public string SigningKey { get; set; } = string.Empty;
    /// <summary>Domain appended to bare usernames such as "admin" so they resolve to an email login.</summary>
    public string UsernameDomain { get; set; } = "commerce.local";
    public int AccessTokenMinutes { get; set; } = 30;
    public int RefreshTokenDays { get; set; } = 14;
}

public sealed class IntegrationOptions
{
    public string ProvisioningSecret { get; set; } = string.Empty;
    public string SignatureHeader { get; set; } = "X-GetAssist-Signature";
    public bool RequireActiveConnection { get; set; } = true;
    public int EventDispatchSeconds { get; set; } = 10;
    public int MaxDeliveryAttempts { get; set; } = 8;
    public bool WebhookSignatureEnabled { get; set; } = true;
}

public sealed class HostPlatformOptions
{
    public string Name { get; set; } = "Get Assist";
    public string? WorkspaceLaunchUrl { get; set; }
    public string? AllowedParentOrigins { get; set; }
    public bool OidcEnabled { get; set; }
    public string? OidcAuthority { get; set; }
    public string? OidcClientId { get; set; }
    public string? OidcAudience { get; set; }
}
