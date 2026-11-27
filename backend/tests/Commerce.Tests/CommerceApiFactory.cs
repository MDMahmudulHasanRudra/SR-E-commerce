using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Commerce.Infrastructure.Integrations;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace Commerce.Tests;

/// <summary>Boots the real API against a throwaway SQLite database and records outgoing webhook calls.</summary>
public sealed class CommerceApiFactory : WebApplicationFactory<Program>
{
    public const string DemoEmail = "admin@commerce.local";
    public const string DemoPassword = "admin@123#";
    public const string ProvisioningSecret = "test-provisioning-secret";

    public RecordingWebhookHandler Webhooks { get; } = new();
    private readonly string _databasePath = Path.Combine(Path.GetTempPath(),
        $"commerce-tests-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Database:Provider"] = "sqlite",
                ["Database:Initialize"] = "true",
                ["ConnectionStrings:Default"] = $"Data Source={_databasePath}",
                ["Seed:DemoAccount"] = "true",
                ["Seed:DemoEmail"] = DemoEmail,
                ["Seed:DemoPassword"] = DemoPassword,
                ["Seed:DemoCompany"] = "Northwind Commerce",
                ["Auth:SigningKey"] = "test-signing-key-that-is-long-enough-for-hs256",
                ["GetAssist:ProvisioningSecret"] = ProvisioningSecret,
                ["GetAssist:EventDispatchSeconds"] = "3600",
                ["RateLimiting:Enabled"] = "false"
            });
        });

        builder.ConfigureServices(services =>
        {
            // The background dispatcher is driven explicitly by the outbox tests.
            foreach (var descriptor in services
                         .Where(d => d.ImplementationType == typeof(OutboxDispatcher)).ToList())
                services.Remove(descriptor);
            services.AddSingleton<OutboxDispatcher>();

            services.AddHttpClient("webhooks")
                .ConfigurePrimaryHttpMessageHandler(() => Webhooks);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try
        {
            if (File.Exists(_databasePath)) File.Delete(_databasePath);
        }
        catch (IOException)
        {
            // SQLite may still hold the file briefly on Windows; OS cleanup is enough.
        }
    }
}

public sealed record RecordedWebhook(Uri Uri, string Body, IReadOnlyDictionary<string, string> Headers);

public sealed class RecordingWebhookHandler : HttpMessageHandler
{
    private readonly List<RecordedWebhook> _requests = [];
    private readonly Lock _gate = new();

    public Func<HttpRequestMessage, int, bool> Respond { get; set; } = (_, _) => true;

    public IReadOnlyList<RecordedWebhook> Requests
    {
        get { lock (_gate) return _requests.ToList(); }
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
        var headers = request.Headers.ToDictionary(h => h.Key, h => string.Join(",", h.Value));
        bool success;
        lock (_gate)
        {
            _requests.Add(new RecordedWebhook(request.RequestUri!, body, headers));
            success = Respond(request, _requests.Count);
        }

        return new HttpResponseMessage(success ? HttpStatusCode.OK : HttpStatusCode.BadGateway);
    }
}

public sealed record LoginResult(string AccessToken, Guid UserId, Guid TenantId, Guid WorkspaceId,
    string Role, string[] Permissions);

public static class ApiTestClient
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task<LoginResult> LoginAsync(this HttpClient client, string? email = null,
        string? password = null)
    {
        using var response = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = email ?? CommerceApiFactory.DemoEmail,
            password = password ?? CommerceApiFactory.DemoPassword
        });
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<AuthPayload>(Json);
        return new LoginResult(payload!.AccessToken, payload.User.UserId, payload.User.TenantId,
            payload.User.WorkspaceId, payload.User.Role, payload.User.Permissions);
    }

    public static HttpClient Authorized(this HttpClient client, string accessToken)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return client;
    }

    public static HttpClient WithApiKey(this HttpClient client, string key)
    {
        client.DefaultRequestHeaders.Remove("X-Api-Key");
        client.DefaultRequestHeaders.Add("X-Api-Key", key);
        return client;
    }

    public static async Task<ProvisioningPayload> ProvisionAsync(this HttpClient client, string hostProjectId,
        Guid? workspaceId = null, string hostCustomerId = "cust-demo", string? webhookUrl = null,
        bool? autoProvisionMembers = null, string? hostSignInUrl = null)
    {
        var body = JsonSerializer.Serialize(new
        {
            hostPlatform = "Get Assist",
            hostCustomerId,
            hostProjectId,
            customerName = "Northwind Commerce",
            projectName = "Demo store",
            workspaceName = "Main Store",
            currency = "USD",
            webhookUrl,
            externalWorkspaceReference = hostProjectId,
            commerceWorkspaceId = workspaceId?.ToString(),
            contractVersion = "v1",
            autoProvisionMembers,
            hostSignInUrl
        }, Json);

        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/integrations/provision")
        {
            Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json")
        };
        request.Headers.Add("X-GetAssist-Timestamp", timestamp);
        request.Headers.Add("X-GetAssist-Signature",
            Commerce.Infrastructure.Security.Hmac.Sign(CommerceApiFactory.ProvisioningSecret,
                $"{timestamp}.{body}"));

        using var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(
                $"Provisioning failed with {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<ProvisioningPayload>(Json))!;
    }

    public sealed record AuthPayload(string AccessToken, UserPayload User);
    public sealed record UserPayload(Guid UserId, Guid TenantId, Guid WorkspaceId, string Role, string[] Permissions);
    public sealed record ProvisioningPayload(Guid TenantId, Guid WorkspaceId, Guid ConnectionId,
        string? ApiKey, string Status, string ApiContractVersion);
}
