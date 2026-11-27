using System.Text;
using System.Text.Json;
using Commerce.Domain.Common;
using Commerce.Infrastructure.Integrations;
using Commerce.Infrastructure.Options;
using Commerce.Infrastructure.Security;
using Commerce.Infrastructure.Services;
using Microsoft.Extensions.Options;

namespace Commerce.Api.Endpoints;

public sealed record ReconnectRequest(string? WebhookUrl);
public sealed record CreateApiKeyRequest(string Name, string[]? Scopes);

public static class IntegrationEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void MapIntegrationEndpoints(this IEndpointRouteBuilder app)
    {
        MapHostApis(app);
        MapProvisioning(app);
        MapAdmin(app);
        MapSso(app);
    }

    private static void MapHostApis(IEndpointRouteBuilder app)
    {
        var host = app.MapGroup("/api/v1/integrations").WithTags("Integration API (host platform)");

        host.MapGet("/products/search", async (string? q, string? sku, Guid? categoryId, int? page, int? pageSize,
            IntegrationQueryService service, CancellationToken ct) =>
        {
            var (result, _) = await service.SearchProductsAsync(q, sku, categoryId, page ?? 1, pageSize ?? 20, ct);
            return Results.Ok(result);
        }).RequireAuthorization($"scope:{IntegrationScopes.ProductsRead}").RequireRateLimiting("integration");

        host.MapGet("/products/{id:guid}", async (Guid id, int? quantity, IntegrationQueryService service,
            CancellationToken ct) => Results.Ok(await service.GetProductAsync(id, quantity ?? 1, ct)))
            .RequireAuthorization($"scope:{IntegrationScopes.ProductsRead}").RequireRateLimiting("integration");

        host.MapGet("/products/{id:guid}/availability", async (Guid id, IntegrationQueryService service,
            CancellationToken ct) => Results.Ok(await service.GetAvailabilityAsync(id, ct)))
            .RequireAuthorization($"scope:{IntegrationScopes.ProductsRead}").RequireRateLimiting("integration");

        host.MapGet("/products/{id:guid}/pricing", async (Guid id, int? quantity, string? couponCode,
            IntegrationQueryService service, CancellationToken ct) =>
            Results.Ok(await service.GetPricingAsync(id, quantity ?? 1, couponCode, ct)))
            .RequireAuthorization($"scope:{IntegrationScopes.ProductsRead}").RequireRateLimiting("integration");

        host.MapGet("/offers/active", async (IntegrationQueryService service, CancellationToken ct) =>
            Results.Ok(await service.GetActiveOffersAsync(ct)))
            .RequireAuthorization($"scope:{IntegrationScopes.OffersRead}").RequireRateLimiting("integration");

        host.MapGet("/customers/search", async (string? q, int? page, int? pageSize,
            IntegrationQueryService service, CancellationToken ct) =>
            Results.Ok(await service.SearchCustomersAsync(q, page ?? 1, pageSize ?? 20, ct)))
            .RequireAuthorization($"scope:{IntegrationScopes.CustomersRead}").RequireRateLimiting("integration");

        host.MapGet("/customers/{id:guid}", async (Guid id, IntegrationQueryService service, CancellationToken ct) =>
            Results.Ok(await service.GetCustomerAsync(id, ct)))
            .RequireAuthorization($"scope:{IntegrationScopes.CustomersRead}").RequireRateLimiting("integration");

        host.MapGet("/customers/{id:guid}/orders", async (Guid id, IntegrationQueryService service, CancellationToken ct) =>
            Results.Ok(await service.GetCustomerOrdersAsync(id, ct)))
            .RequireAuthorization($"scope:{IntegrationScopes.CustomersRead}").RequireRateLimiting("integration");

        host.MapGet("/orders/{id:guid}", async (Guid id, IntegrationQueryService service, CancellationToken ct) =>
            Results.Ok(await service.GetOrderAsync(id, ct)))
            .RequireAuthorization($"scope:{IntegrationScopes.OrdersRead}").RequireRateLimiting("integration");

        host.MapGet("/orders/{id:guid}/status", async (Guid id, IntegrationQueryService service, CancellationToken ct) =>
            Results.Ok(await service.GetOrderStatusAsync(id, ct)))
            .RequireAuthorization($"scope:{IntegrationScopes.OrdersRead}").RequireRateLimiting("integration");
    }

    private static void MapProvisioning(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/v1/integrations/provision", async (HttpContext context, ProvisioningService provisioning,
            IOptions<IntegrationOptions> options, CancellationToken ct) =>
        {
            var settings = options.Value;
            if (string.IsNullOrWhiteSpace(settings.ProvisioningSecret))
                return Results.Json(new
                {
                    error = new
                    {
                        code = "INTEGRATION_NOT_CONFIGURED",
                        message = "Host platform provisioning is not configured on this deployment."
                    }
                }, statusCode: StatusCodes.Status503ServiceUnavailable);

            var (request, refusal) = await ReadSignedAsync<ProvisioningRequest>(context, settings, "provisioning", ct);
            if (refusal is not null) return refusal;

            var result = await provisioning.ProvisionAsync(request!, ct);
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(result);
        }).AllowAnonymous().RequireRateLimiting("provisioning").WithTags("Provisioning");

        // The host's own connection, signed like provisioning: a replacement key when the host lost it, and a pause
        // the host can undo. A Commerce admin's disable or revoke always wins (HostConnectionService).
        MapHostConnectionAction(app, "/api/v1/integrations/connection/key", (s, r, ct) => s.ReplaceKeyAsync(r, ct));
        MapHostConnectionAction(app, "/api/v1/integrations/connection/pause", (s, r, ct) => s.PauseAsync(r, ct));
        MapHostConnectionAction(app, "/api/v1/integrations/connection/resume", (s, r, ct) => s.ResumeAsync(r, ct));
    }

    private static void MapHostConnectionAction(IEndpointRouteBuilder app, string path,
        Func<HostConnectionService, HostConnectionRequest, CancellationToken, Task<HostConnectionResult>> action)
    {
        app.MapPost(path, async (HttpContext context, HostConnectionService service,
            IOptions<IntegrationOptions> options, CancellationToken ct) =>
        {
            var settings = options.Value;
            if (string.IsNullOrWhiteSpace(settings.ProvisioningSecret))
                return Results.Json(new
                {
                    error = new { code = "INTEGRATION_NOT_CONFIGURED", message = "Host platform provisioning is not configured on this deployment." }
                }, statusCode: StatusCodes.Status503ServiceUnavailable);
            var (request, refusal) = await ReadSignedAsync<HostConnectionRequest>(context, settings, "connection", ct);
            if (refusal is not null) return refusal;
            var result = await action(service, request!, ct);
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(result);
        }).AllowAnonymous().RequireRateLimiting("provisioning").WithTags("Provisioning");
    }

    private static void MapAdmin(IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/v1/integration").WithTags("Integration settings");

        admin.MapGet("/status", async (IntegrationAdminService service, CancellationToken ct) =>
            Results.Ok(await service.GetStatusAsync(ct))).RequireAuthorization("Admin");

        admin.MapPost("/disable", async (IntegrationAdminService service, CancellationToken ct) =>
            Results.Ok(await service.DisableAsync(ct))).RequireAuthorization("Admin");

        admin.MapPost("/reconnect", async (ReconnectRequest request, IntegrationAdminService service,
            CancellationToken ct) => Results.Ok(await service.ReconnectAsync(request.WebhookUrl, ct)))
            .RequireAuthorization("Admin");

        admin.MapPost("/revoke", async (IntegrationAdminService service, CancellationToken ct) =>
            Results.Ok(await service.RevokeAsync(ct))).RequireAuthorization("Admin");

        admin.MapGet("/api-keys", async (ApiKeyService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct))).RequireAuthorization("Admin");

        admin.MapPost("/api-keys", async (CreateApiKeyRequest request, ApiKeyService service,
            HttpContext context, CancellationToken ct) =>
        {
            var created = await service.CreateAsync(request.Name, request.Scopes ?? [], ct);
            context.Response.Headers.CacheControl = "no-store";
            return Results.Created("/api/v1/integration/api-keys", created);
        }).RequireAuthorization("Admin");

        admin.MapDelete("/api-keys/{id:guid}", async (Guid id, ApiKeyService service, CancellationToken ct) =>
        {
            await service.RevokeAsync(id, ct);
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        admin.MapGet("/events", async (int? limit, OutboxService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(limit ?? 100, ct))).RequireAuthorization("Admin");

        admin.MapGet("/deliveries", async (Guid? eventId, int? limit, OutboxService service, CancellationToken ct) =>
            Results.Ok(await service.ListDeliveriesAsync(eventId, limit ?? 100, ct))).RequireAuthorization("Admin");

        admin.MapPost("/events/{id:guid}/retry", async (Guid id, OutboxService service, CancellationToken ct) =>
        {
            await service.RetryAsync(id, ct);
            return Results.Ok(new { queued = true });
        }).RequireAuthorization("Admin");
    }

    private static void MapSso(IEndpointRouteBuilder app)
    {
        // Host-initiated sign-in: signed with the provisioning secret, like provisioning itself. It returns a
        // single-use code for the Commerce dashboard; it never returns a session.
        app.MapPost("/api/v1/integrations/sso/launch", async (HttpContext context, HostSignInService signIn,
            IOptions<IntegrationOptions> options, CancellationToken ct) =>
        {
            var settings = options.Value;
            if (string.IsNullOrWhiteSpace(settings.ProvisioningSecret))
                return Results.Json(new
                {
                    error = new { code = "INTEGRATION_NOT_CONFIGURED", message = "Host platform sign-in is not configured on this deployment." }
                }, statusCode: StatusCodes.Status503ServiceUnavailable);
            var (request, refusal) = await ReadSignedAsync<HostLaunchRequest>(context, settings, "sign-in", ct);
            if (refusal is not null) return refusal;
            var result = await signIn.CreateLaunchAsync(request!, ct);
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(result);
        }).AllowAnonymous().RequireRateLimiting("provisioning").WithTags("SSO");

        app.MapPost("/api/v1/integrations/sso/exchange", (IOptions<HostPlatformOptions> options) =>
        {
            return Results.Json(new
            {
                error = new
                {
                    code = "SSO_NOT_CONFIGURED",
                    message = "External SSO is not active. Commerce does not accept client-controlled launch parameters " +
                              "as authentication. An OpenID Connect contract with Get Assist must be agreed and configured first."
                }
            }, statusCode: StatusCodes.Status501NotImplemented);
        }).AllowAnonymous().WithTags("SSO");
    }

    /// <summary>Reads a body signed with the provisioning secret: HMAC over "{timestamp}.{rawBody}", ±5 minutes.</summary>
    private static async Task<(T? Request, IResult? Refusal)> ReadSignedAsync<T>(HttpContext context,
        IntegrationOptions settings, string what, CancellationToken ct) where T : class
    {
        var timestamp = context.Request.Headers["X-GetAssist-Timestamp"].ToString();
        var signature = context.Request.Headers[settings.SignatureHeader].ToString();
        if (string.IsNullOrWhiteSpace(timestamp) || string.IsNullOrWhiteSpace(signature))
            return (null, Unauthorized($"Missing {what} signature headers."));

        using var reader = new StreamReader(context.Request.Body, Encoding.UTF8, leaveOpen: true);
        var raw = await reader.ReadToEndAsync(ct);
        if (!Hmac.VerifyProvisioning(settings.ProvisioningSecret, timestamp, raw, signature))
            return (null, Unauthorized($"The {what} signature is invalid or has expired."));

        T? request;
        try
        {
            request = JsonSerializer.Deserialize<T>(raw, JsonOptions);
        }
        catch (JsonException)
        {
            return (null, Results.BadRequest(new
            {
                error = new { code = "VALIDATION_ERROR", message = $"The {what} payload is not valid JSON." }
            }));
        }
        if (request is null)
            return (null, Results.BadRequest(new { error = new { code = "VALIDATION_ERROR", message = $"A {what} payload is required." } }));
        return (request, null);
    }

    private static IResult Unauthorized(string message) =>
        Results.Json(new { error = new { code = "UNAUTHORIZED", message } },
            statusCode: StatusCodes.Status401Unauthorized);
}
