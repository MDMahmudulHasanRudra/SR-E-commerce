using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Commerce.Domain.Identity;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Commerce.Tests;

/// <summary>
/// Signing in from the host platform: a signed launch → a single-use code → a Commerce session, only for a
/// host person who linked their own Commerce account by signing in to it once, and only while that account
/// is an active member of the connected workspace.
/// </summary>
public sealed class HostSignInTests
{
    private const string Subject = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

    [Fact]
    public async Task Launch_needs_a_valid_signature_and_a_connected_project()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var project = $"ga-project-{Guid.NewGuid():N}";
        await client.ProvisionAsync(project, login.WorkspaceId);

        using var unsigned = await client.PostAsJsonAsync("/api/v1/integrations/sso/launch",
            new { hostPlatform = "Get Assist", hostCustomerId = "cust-demo", hostProjectId = project, subject = Subject });
        Assert.Equal(HttpStatusCode.Unauthorized, unsigned.StatusCode);

        using var wrongSecret = await client.SendLaunchAsync(project, Subject, secret: "not-the-secret");
        Assert.Equal(HttpStatusCode.Unauthorized, wrongSecret.StatusCode);

        using var unknown = await client.SendLaunchAsync($"ga-other-{Guid.NewGuid():N}", Subject);
        Assert.Equal(HttpStatusCode.Forbidden, unknown.StatusCode);

        using var otherCustomer = await client.SendLaunchAsync(project, Subject, hostCustomerId: "cust-someone-else");
        Assert.Equal(HttpStatusCode.Forbidden, otherCustomer.StatusCode);

        using var badSubject = await client.SendLaunchAsync(project, "short");
        Assert.Equal(HttpStatusCode.BadRequest, badSubject.StatusCode);
    }

    [Fact]
    public async Task First_launch_asks_to_link_then_signs_in_without_a_password()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var project = $"ga-project-{Guid.NewGuid():N}";
        await client.ProvisionAsync(project, login.WorkspaceId);

        var first = await client.LaunchAsync(project, Subject, returnPath: "/products");
        Assert.Equal("link", first.GetProperty("mode").GetString());
        var linkCode = CodeOf(first);

        // A link code only describes itself; it is not spent and carries no session.
        var peek = await client.RedeemAsync(linkCode);
        Assert.True(peek.GetProperty("linkRequired").GetBoolean());
        Assert.Equal(JsonValueKind.Null, peek.GetProperty("session").ValueKind);
        Assert.True((await client.RedeemAsync(linkCode)).GetProperty("linkRequired").GetBoolean());

        // Linking needs the person's own Commerce sign-in.
        using (var anonymous = await client.PostAsJsonAsync("/api/v1/auth/sso/link", new { code = linkCode }))
            Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        using var person = factory.CreateClient().Authorized(login.AccessToken);
        var linked = await person.PostJsonAsync("/api/v1/auth/sso/link", new { code = linkCode });
        Assert.Equal("/products", linked.GetProperty("returnPath").GetString());
        Assert.Equal(login.WorkspaceId, linked.GetProperty("session").GetProperty("user").GetProperty("workspaceId").GetGuid());
        using (var again = await person.PostAsJsonAsync("/api/v1/auth/sso/link", new { code = linkCode }))
            Assert.Equal(HttpStatusCode.Unauthorized, again.StatusCode);

        var second = await client.LaunchAsync(project, Subject);
        Assert.Equal("signIn", second.GetProperty("mode").GetString());
        var signInCode = CodeOf(second);
        var session = await client.RedeemAsync(signInCode);
        Assert.False(session.GetProperty("linkRequired").GetBoolean());
        Assert.Equal("/dashboard", session.GetProperty("returnPath").GetString());
        var user = session.GetProperty("session").GetProperty("user");
        Assert.Equal(login.UserId, user.GetProperty("userId").GetGuid());
        Assert.Equal(login.WorkspaceId, user.GetProperty("workspaceId").GetGuid());

        // The session works like a password sign-in.
        using var signedIn = factory.CreateClient().Authorized(session.GetProperty("session").GetProperty("accessToken").GetString()!);
        Assert.Equal(HttpStatusCode.OK, (await signedIn.GetAsync("/api/v1/auth/me")).StatusCode);

        // Single use.
        using (var replay = await client.PostAsJsonAsync("/api/v1/auth/sso/redeem", new { code = signInCode }))
            Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);

        // Another host person in the same project is not signed in as this one.
        var stranger = await client.LaunchAsync(project, new string('f', 64));
        Assert.Equal("link", stranger.GetProperty("mode").GetString());

        // The link is not usable from another host project.
        var otherProject = $"ga-project-{Guid.NewGuid():N}";
        var secondWorkspace = await NewWorkspaceForDemoOwnerAsync(factory, login);
        await client.ProvisionAsync(otherProject, secondWorkspace);
        Assert.Equal("link", (await client.LaunchAsync(otherProject, Subject)).GetProperty("mode").GetString());
    }

    [Fact]
    public async Task Expired_codes_are_refused()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var project = $"ga-project-{Guid.NewGuid():N}";
        await client.ProvisionAsync(project, login.WorkspaceId);
        await LinkAsync(factory, client, login, project);

        var launch = await client.LaunchAsync(project, Subject);
        var expires = launch.GetProperty("expiresAtUtc").GetDateTime();
        Assert.True(expires <= DateTime.UtcNow.AddMinutes(2.1));
        await WithDbAsync(factory, db => db.HostLaunchCodes.IgnoreQueryFilters()
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.ExpiresAtUtc, DateTime.UtcNow.AddSeconds(-1))));

        using var response = await client.PostAsJsonAsync("/api/v1/auth/sso/redeem", new { code = CodeOf(launch) });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_disabled_connection_or_an_ended_membership_stops_sign_in()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var project = $"ga-project-{Guid.NewGuid():N}";
        await client.ProvisionAsync(project, login.WorkspaceId);
        await LinkAsync(factory, client, login, project);

        // Ended membership: an outstanding sign-in code no longer works, and new launches ask to link again.
        var beforeEnd = CodeOf(await client.LaunchAsync(project, Subject));
        await WithDbAsync(factory, db => db.Memberships.IgnoreQueryFilters()
            .Where(m => m.UserId == login.UserId && m.WorkspaceId == login.WorkspaceId)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.IsActive, false)));
        using (var refused = await client.PostAsJsonAsync("/api/v1/auth/sso/redeem", new { code = beforeEnd }))
            Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Equal("link", (await client.LaunchAsync(project, Subject)).GetProperty("mode").GetString());
        await WithDbAsync(factory, db => db.Memberships.IgnoreQueryFilters()
            .Where(m => m.UserId == login.UserId && m.WorkspaceId == login.WorkspaceId)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.IsActive, true)));

        // Disabled connection: no launch, and an outstanding code is refused.
        var beforeDisable = CodeOf(await client.LaunchAsync(project, Subject));
        using var admin = factory.CreateClient().Authorized(login.AccessToken);
        (await admin.PostAsync("/api/v1/integration/disable", null)).EnsureSuccessStatusCode();
        using (var launch = await client.SendLaunchAsync(project, Subject))
            Assert.Equal(HttpStatusCode.Forbidden, launch.StatusCode);
        using (var redeem = await client.PostAsJsonAsync("/api/v1/auth/sso/redeem", new { code = beforeDisable }))
            Assert.Equal(HttpStatusCode.Forbidden, redeem.StatusCode);
    }

    [Fact]
    public async Task A_deactivated_user_is_not_signed_in()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var project = $"ga-project-{Guid.NewGuid():N}";
        await client.ProvisionAsync(project, login.WorkspaceId);
        await LinkAsync(factory, client, login, project);

        var code = CodeOf(await client.LaunchAsync(project, Subject));
        await WithDbAsync(factory, db => db.Users.IgnoreQueryFilters()
            .Where(u => u.Id == login.UserId).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsActive, false)));
        using var refused = await client.PostAsJsonAsync("/api/v1/auth/sso/redeem", new { code });
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
    }

    [Fact]
    public async Task A_code_presented_many_times_at_once_signs_in_once()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var project = $"ga-project-{Guid.NewGuid():N}";
        await client.ProvisionAsync(project, login.WorkspaceId);
        await LinkAsync(factory, client, login, project);

        var code = CodeOf(await client.LaunchAsync(project, Subject));
        var attempts = await Task.WhenAll(Enumerable.Range(0, 8).Select(async _ =>
        {
            using var c = factory.CreateClient();
            using var response = await c.PostAsJsonAsync("/api/v1/auth/sso/redeem", new { code });
            return response.StatusCode;
        }));
        Assert.Equal(1, attempts.Count(s => s == HttpStatusCode.OK));
        Assert.All(attempts.Where(s => s != HttpStatusCode.OK), s => Assert.Equal(HttpStatusCode.Unauthorized, s));
    }

    [Fact]
    public async Task Only_a_member_of_the_connected_workspace_can_be_linked()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var project = $"ga-project-{Guid.NewGuid():N}";
        await client.ProvisionAsync(project, login.WorkspaceId);

        // Someone with their own Commerce company is not a member of this workspace.
        using var outsider = factory.CreateClient();
        var email = $"outsider-{Guid.NewGuid():N}@example.com";
        (await outsider.PostAsJsonAsync("/api/v1/auth/register", new
        {
            companyName = "Outsider Ltd", fullName = "Out Sider", email, password = "Outsider123!", seedDemoData = false
        })).EnsureSuccessStatusCode();
        var outsiderLogin = await outsider.LoginAsync(email, "Outsider123!");
        outsider.Authorized(outsiderLogin.AccessToken);

        var code = CodeOf(await client.LaunchAsync(project, Subject));
        using var refused = await outsider.PostAsJsonAsync("/api/v1/auth/sso/link", new { code });
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        // The refusal did not spend the code: the real member can still link with it.
        using var member = factory.CreateClient().Authorized(login.AccessToken);
        await member.PostJsonAsync("/api/v1/auth/sso/link", new { code });

        // A sign-in code is not a link code.
        var signIn = CodeOf(await client.LaunchAsync(project, Subject));
        using var wrongKind = await member.PostAsJsonAsync("/api/v1/auth/sso/link", new { code = signIn });
        Assert.Equal(HttpStatusCode.Unauthorized, wrongKind.StatusCode);
    }

    [Theory]
    [InlineData("//evil.example/x", "/dashboard")]
    [InlineData("https://evil.example", "/dashboard")]
    [InlineData("/products\\..\\x", "/dashboard")]
    [InlineData("/sso/launch", "/dashboard")]
    [InlineData("/login", "/dashboard")]
    [InlineData("/orders?status=open", "/orders?status=open")]
    [InlineData(null, "/dashboard")]
    public void Return_paths_stay_inside_Commerce(string? raw, string expected) =>
        Assert.Equal(expected, Commerce.Infrastructure.Integrations.HostSignInService.SafeReturnPath(raw));

    [Fact]
    public async Task Only_hashes_of_codes_are_stored_and_status_reports_host_launch()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var project = $"ga-project-{Guid.NewGuid():N}";
        await client.ProvisionAsync(project, login.WorkspaceId);
        var code = CodeOf(await client.LaunchAsync(project, Subject));

        await WithDbAsync(factory, async db =>
        {
            var stored = await db.HostLaunchCodes.IgnoreQueryFilters().SingleAsync();
            Assert.NotEqual(code, stored.CodeHash);
            Assert.Equal(PasswordHasher.Sha256Hex(code), stored.CodeHash);
            return 0;
        });

        var status = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/sso/status");
        Assert.True(status.GetProperty("enabled").GetBoolean());
        Assert.Equal("host-launch", status.GetProperty("mode").GetString());
    }

    private static string CodeOf(JsonElement launch)
    {
        var path = launch.GetProperty("launchPath").GetString()!;
        Assert.StartsWith("/sso/launch#code=", path);
        return path["/sso/launch#code=".Length..];
    }

    private static async Task LinkAsync(CommerceApiFactory factory, HttpClient client, LoginResult login, string project)
    {
        var code = CodeOf(await client.LaunchAsync(project, Subject));
        using var person = factory.CreateClient().Authorized(login.AccessToken);
        await person.PostJsonAsync("/api/v1/auth/sso/link", new { code });
    }

    private static async Task<Guid> NewWorkspaceForDemoOwnerAsync(CommerceApiFactory factory, LoginResult login)
    {
        var workspaceId = Guid.NewGuid();
        await WithDbAsync(factory, async db =>
        {
            db.Workspaces.Add(new CommerceWorkspace
            {
                Id = workspaceId, TenantId = login.TenantId, Name = "Second Store", Slug = $"second-{workspaceId:N}"
            });
            db.Memberships.Add(new CommerceMembership
            {
                TenantId = login.TenantId, WorkspaceId = workspaceId, UserId = login.UserId, Role = Commerce.Domain.UserRole.Owner
            });
            return await db.SaveChangesAsync();
        });
        return workspaceId;
    }

    private static async Task WithDbAsync(CommerceApiFactory factory, Func<CommerceDbContext, Task<int>> work)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<ITenantContext>().SetSystem();
        await work(scope.ServiceProvider.GetRequiredService<CommerceDbContext>());
    }
}

public static class HostSignInClient
{
    public static async Task<HttpResponseMessage> SendLaunchAsync(this HttpClient client, string hostProjectId,
        string subject, string? returnPath = null, string hostCustomerId = "cust-demo",
        string secret = CommerceApiFactory.ProvisioningSecret, string? email = null, string? role = null,
        bool? autoProvision = null, string? displayName = "Rudra")
    {
        var body = JsonSerializer.Serialize(new
        {
            hostPlatform = "Get Assist",
            hostCustomerId,
            hostProjectId,
            subject,
            displayName,
            returnPath,
            email,
            role,
            autoProvision
        }, ApiTestClient.Json);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/integrations/sso/launch")
        {
            Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json")
        };
        request.Headers.Add("X-GetAssist-Timestamp", timestamp);
        request.Headers.Add("X-GetAssist-Signature", Hmac.Sign(secret, $"{timestamp}.{body}"));
        return await client.SendAsync(request);
    }

    public static async Task<JsonElement> LaunchAsync(this HttpClient client, string hostProjectId, string subject,
        string? returnPath = null)
    {
        using var response = await client.SendLaunchAsync(hostProjectId, subject, returnPath);
        if (!response.IsSuccessStatusCode)
            throw new Xunit.Sdk.XunitException($"Launch failed with {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return await response.Content.ReadFromJsonAsync<JsonElement>(ApiTestClient.Json);
    }

    public static async Task<JsonElement> RedeemAsync(this HttpClient client, string code)
    {
        using var response = await client.PostAsJsonAsync("/api/v1/auth/sso/redeem", new { code });
        if (!response.IsSuccessStatusCode)
            throw new Xunit.Sdk.XunitException($"Redeem failed with {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return await response.Content.ReadFromJsonAsync<JsonElement>(ApiTestClient.Json);
    }

    public static async Task<JsonElement> PostJsonAsync(this HttpClient client, string url, object body)
    {
        using var response = await client.PostAsJsonAsync(url, body, ApiTestClient.Json);
        if (!response.IsSuccessStatusCode)
            throw new Xunit.Sdk.XunitException($"POST {url} failed with {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return await response.Content.ReadFromJsonAsync<JsonElement>(ApiTestClient.Json);
    }
}
