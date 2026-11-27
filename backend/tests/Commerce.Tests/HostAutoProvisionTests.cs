using System.Net.Http.Json;
using System.Text.Json;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Commerce.Tests;

/// <summary>
/// The host's auto-provision policy ("same login"): set only by signed provisioning, used only when the launch asks
/// for it, never taking over an existing email and never overruling a workspace admin who removed someone.
/// </summary>
public sealed class HostAutoProvisionTests
{
    private const string SignInUrl = "https://noorvip.chithii.com/p/shop/apps/commerce/continue";

    private static string NewSubject() => Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");

    private static async Task<JsonElement> OpenAsync(HttpClient client, string project, string subject, string? email,
        string role, bool autoProvision = true)
    {
        using var response = await client.SendLaunchAsync(project, subject, email: email, role: role,
            autoProvision: autoProvision, displayName: "Rahim Uddin");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return await response.Content.ReadFromJsonAsync<JsonElement>(ApiTestClient.Json);
    }

    private static string CodeOf(JsonElement launch) =>
        launch.GetProperty("launchPath").GetString()!.Split("#code=")[1];

    [Fact]
    public async Task A_new_store_lets_its_team_in_with_their_host_login()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var project = $"ga-project-{Guid.NewGuid():N}";
        var provisioned = await client.ProvisionAsync(project, autoProvisionMembers: true, hostSignInUrl: SignInUrl);

        // The Main Admin: the store's first Owner, signed straight in.
        var owner = await OpenAsync(client, project, NewSubject(), $"owner-{Guid.NewGuid():N}@example.com", "OWNER");
        Assert.Equal("signIn", owner.GetProperty("mode").GetString());
        var session = await client.RedeemAsync(CodeOf(owner));
        var user = session.GetProperty("session").GetProperty("user");
        Assert.Equal("Owner", user.GetProperty("role").GetString());
        Assert.Equal(provisioned.WorkspaceId, user.GetProperty("workspaceId").GetGuid());
        Assert.Equal(SignInUrl, session.GetProperty("hostSignInUrl").GetString());

        // A second Main Admin or Lead becomes Admin; everyone else Staff.
        var lead = await client.RedeemAsync(CodeOf(await OpenAsync(client, project, NewSubject(), null, "OWNER")));
        Assert.Equal("Admin", lead.GetProperty("session").GetProperty("user").GetProperty("role").GetString());
        var member = await client.RedeemAsync(CodeOf(await OpenAsync(client, project, NewSubject(), null, "MEMBER")));
        Assert.Equal("Staff", member.GetProperty("session").GetProperty("user").GetProperty("role").GetString());

        // Next time the same person is simply signed in; no second account.
        var subject = NewSubject();
        await client.RedeemAsync(CodeOf(await OpenAsync(client, project, subject, null, "MEMBER")));
        Assert.Equal("signIn", (await OpenAsync(client, project, subject, null, "MEMBER")).GetProperty("mode").GetString());

        var (users, audits) = await CountAsync(factory, provisioned.TenantId);
        Assert.Equal(4, users);
        Assert.Equal(4, audits);
    }

    [Fact]
    public async Task Nothing_is_created_without_the_hosts_policy_and_the_launchs_request()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var off = $"ga-project-{Guid.NewGuid():N}";
        var provisioned = await client.ProvisionAsync(off);
        Assert.Equal("link", (await OpenAsync(client, off, NewSubject(), null, "OWNER")).GetProperty("mode").GetString());

        var on = $"ga-project-{Guid.NewGuid():N}";
        await client.ProvisionAsync(on, autoProvisionMembers: true);
        Assert.Equal("link", (await OpenAsync(client, on, NewSubject(), null, "OWNER", autoProvision: false))
            .GetProperty("mode").GetString());
        Assert.Equal(0, (await CountAsync(factory, provisioned.TenantId)).Users);

        // A signed re-provision turns the policy on for a connection that already exists.
        await client.ProvisionAsync(off, autoProvisionMembers: true, hostSignInUrl: "http://evil.example.com/continue");
        Assert.Equal("signIn", (await OpenAsync(client, off, NewSubject(), null, "OWNER")).GetProperty("mode").GetString());
        await WithDbAsync(factory, async db =>
        {
            var connection = await db.AppConnections.IgnoreQueryFilters().SingleAsync(c => c.HostProjectId == off);
            Assert.True(connection.AutoProvisionMembers);
            Assert.Null(connection.HostSignInUrl); // plain HTTP to another host is never stored
        });
    }

    [Fact]
    public async Task An_existing_email_is_never_taken_over_and_a_removed_member_is_not_recreated()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var project = $"ga-project-{Guid.NewGuid():N}";
        await client.ProvisionAsync(project, login.WorkspaceId, autoProvisionMembers: true);

        // The demo owner's email already has an account: they link it with that account's password instead.
        var taken = await OpenAsync(client, project, NewSubject(), "ADMIN@commerce.local", "OWNER");
        Assert.Equal("link", taken.GetProperty("mode").GetString());

        var subject = NewSubject();
        var first = await client.RedeemAsync(CodeOf(await OpenAsync(client, project, subject, null, "MEMBER")));
        var userId = first.GetProperty("session").GetProperty("user").GetProperty("userId").GetGuid();

        // A workspace admin removes them in Commerce; the host cannot bring them back.
        await WithDbAsync(factory, async db =>
        {
            await db.Memberships.IgnoreQueryFilters().Where(m => m.UserId == userId)
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.IsActive, false));
            await db.HostIdentityLinks.IgnoreQueryFilters().Where(l => l.UserId == userId).ExecuteDeleteAsync();
        });
        Assert.Equal("link", (await OpenAsync(client, project, subject, null, "MEMBER")).GetProperty("mode").GetString());
        await WithDbAsync(factory, async db =>
            Assert.False(await db.Memberships.IgnoreQueryFilters().AnyAsync(m => m.UserId == userId && m.IsActive)));
    }

    private static async Task<(int Users, int Audits)> CountAsync(CommerceApiFactory factory, Guid tenantId)
    {
        var result = (0, 0);
        await WithDbAsync(factory, async db =>
        {
            result = (await db.Users.IgnoreQueryFilters().CountAsync(u => u.TenantId == tenantId && u.ExternalIssuer != null),
                await db.AuditLogs.IgnoreQueryFilters().CountAsync(a => a.Action == "integration.member_auto_provisioned"));
        });
        return result;
    }

    private static async Task WithDbAsync(CommerceApiFactory factory, Func<CommerceDbContext, Task> work)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<ITenantContext>().SetSystem();
        await work(scope.ServiceProvider.GetRequiredService<CommerceDbContext>());
    }
}
