using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Commerce.Infrastructure.Security;

namespace Commerce.Tests;

/// <summary>
/// What the host may do to its own connection (signed like provisioning): replace a lost key, which revokes the old
/// one at once, and pause the connection and resume its OWN pause. A Commerce admin's disable always wins.
/// </summary>
public sealed class HostConnectionTests
{
    [Fact]
    public async Task A_replacement_key_works_and_the_old_one_stops_at_once()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var project = $"ga-project-{Guid.NewGuid():N}";
        var first = await client.ProvisionAsync(project);
        Assert.NotNull(first.ApiKey);

        using (var unsigned = await client.PostAsJsonAsync("/api/v1/integrations/connection/key",
                   new { hostPlatform = "Get Assist", hostCustomerId = "cust-demo", hostProjectId = project }))
            Assert.Equal(HttpStatusCode.Unauthorized, unsigned.StatusCode);
        using (var wrong = await client.SendHostConnectionAsync("key", project, secret: "not-the-secret"))
            Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        using (var unknown = await client.SendHostConnectionAsync("key", $"ga-other-{Guid.NewGuid():N}"))
            Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);

        var replaced = await client.HostConnectionAsync("key", project);
        var newKey = replaced.GetProperty("apiKey").GetString()!;
        Assert.StartsWith("cmk_", newKey);
        Assert.NotEqual(first.ApiKey, newKey);

        using var withNew = factory.CreateClient().WithApiKey(newKey);
        (await withNew.GetAsync("/api/v1/integrations/products/search?pageSize=1")).EnsureSuccessStatusCode();
        using var withOld = factory.CreateClient().WithApiKey(first.ApiKey!);
        using (var refused = await withOld.GetAsync("/api/v1/integrations/products/search?pageSize=1"))
            Assert.Equal(HttpStatusCode.Unauthorized, refused.StatusCode);
    }

    [Fact]
    public async Task The_host_resumes_only_its_own_pause()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var project = $"ga-project-{Guid.NewGuid():N}";
        var provisioned = await client.ProvisionAsync(project, login.WorkspaceId);
        using var keyClient = factory.CreateClient().WithApiKey(provisioned.ApiKey!);

        Assert.Equal("Disabled", (await client.HostConnectionAsync("pause", project)).GetProperty("status").GetString());
        using (var paused = await keyClient.GetAsync("/api/v1/integrations/products/search?pageSize=1"))
            Assert.NotEqual(HttpStatusCode.OK, paused.StatusCode);
        // A paused connection gets no new key either.
        using (var noKey = await client.SendHostConnectionAsync("key", project))
            Assert.Equal(HttpStatusCode.Forbidden, noKey.StatusCode);

        Assert.Equal("Active", (await client.HostConnectionAsync("resume", project)).GetProperty("status").GetString());
        (await keyClient.GetAsync("/api/v1/integrations/products/search?pageSize=1")).EnsureSuccessStatusCode();

        // A Commerce admin's own disable is not the host's to undo.
        using var admin = factory.CreateClient().Authorized(login.AccessToken);
        (await admin.PostAsync("/api/v1/integration/disable", null)).EnsureSuccessStatusCode();
        using (var refused = await client.SendHostConnectionAsync("resume", project))
            Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        // Pausing something already off changes nothing.
        Assert.Equal("Disabled", (await client.HostConnectionAsync("pause", project)).GetProperty("status").GetString());
        using (var stillRefused = await client.SendHostConnectionAsync("resume", project))
            Assert.Equal(HttpStatusCode.Forbidden, stillRefused.StatusCode);
    }
}

public static class HostConnectionClient
{
    public static async Task<HttpResponseMessage> SendHostConnectionAsync(this HttpClient client, string action,
        string hostProjectId, string hostCustomerId = "cust-demo", string secret = CommerceApiFactory.ProvisioningSecret)
    {
        var body = JsonSerializer.Serialize(new { hostPlatform = "Get Assist", hostCustomerId, hostProjectId }, ApiTestClient.Json);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/integrations/connection/{action}")
        {
            Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json")
        };
        request.Headers.Add("X-GetAssist-Timestamp", timestamp);
        request.Headers.Add("X-GetAssist-Signature", Hmac.Sign(secret, $"{timestamp}.{body}"));
        return await client.SendAsync(request);
    }

    public static async Task<JsonElement> HostConnectionAsync(this HttpClient client, string action, string hostProjectId)
    {
        using var response = await client.SendHostConnectionAsync(action, hostProjectId);
        if (!response.IsSuccessStatusCode)
            throw new Xunit.Sdk.XunitException($"{action} failed with {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return await response.Content.ReadFromJsonAsync<JsonElement>(ApiTestClient.Json);
    }
}
