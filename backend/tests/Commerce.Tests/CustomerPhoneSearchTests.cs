using System.Net.Http.Json;
using System.Text.Json;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Commerce.Tests;

/// <summary>The host looks a customer up by the digits of a verified WhatsApp number; Commerce stores numbers as typed.</summary>
public sealed class CustomerPhoneSearchTests
{
    [Theory]
    [InlineData("33612345678", true)]
    [InlineData("+33612345678", true)]
    [InlineData("612345678", true)]
    [InlineData("33699999999", false)]
    public async Task A_number_typed_with_spaces_is_found_by_its_digits(string query, bool found)
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var provisioned = await client.ProvisionAsync($"ga-project-{Guid.NewGuid():N}", login.WorkspaceId);
        using (var scope = factory.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<ITenantContext>().SetSystem();
            var db = scope.ServiceProvider.GetRequiredService<CommerceDbContext>();
            Assert.Equal(1, await db.Customers.IgnoreQueryFilters().Where(c => c.FirstName == "Lucas" && c.LastName == "Martin")
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.Phone, "+33 (6) 12-34.56 78")));
        }

        using var keyClient = factory.CreateClient();
        keyClient.WithApiKey(provisioned.ApiKey!);
        var result = await keyClient.GetFromJsonAsync<JsonElement>(
            $"/api/v1/integrations/customers/search?q={Uri.EscapeDataString(query)}");
        Assert.Equal(found, result.GetProperty("items").EnumerateArray()
            .Any(c => c.GetProperty("displayName").GetString() == "Lucas Martin"));
    }
}
