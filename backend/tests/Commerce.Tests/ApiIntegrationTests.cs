using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Commerce.Infrastructure.Integrations;
using Microsoft.Extensions.DependencyInjection;

namespace Commerce.Tests;

public sealed class ApiIntegrationTests
{
    [Fact]
    public async Task Demo_login_returns_seeded_workspace_and_data()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();

        var login = await client.LoginAsync();
        client.Authorized(login.AccessToken);

        Assert.Equal("Owner", login.Role);
        Assert.Contains("products.read", login.Permissions);

        var dashboard = await client.GetFromJsonAsync<JsonElement>("/api/v1/dashboard");
        Assert.Equal(10, dashboard.GetProperty("products").GetInt32());
        Assert.Equal(10, dashboard.GetProperty("orders").GetInt32());
        Assert.True(dashboard.GetProperty("revenue").GetDecimal() > 0);

        var products = await client.GetFromJsonAsync<JsonElement>("/api/v1/products?page=1&pageSize=8");
        Assert.Equal(10, products.GetProperty("totalCount").GetInt32());
        Assert.NotEmpty(products.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task Username_admin_logs_in_without_an_email_domain()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();

        var login = await client.LoginAsync("admin");

        Assert.Equal("Owner", login.Role);
        Assert.Contains("products.read", login.Permissions);
    }

    [Fact]
    public async Task Provisioning_is_idempotent_and_returns_the_api_key_only_once()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();
        var login = await client.LoginAsync();
        var projectId = $"ga-project-{Guid.NewGuid():N}";

        var first = await client.ProvisionAsync(projectId, login.WorkspaceId);
        Assert.Equal(login.WorkspaceId, first.WorkspaceId);
        Assert.Equal("Active", first.Status);
        Assert.False(string.IsNullOrWhiteSpace(first.ApiKey));
        Assert.StartsWith("cmk_", first.ApiKey);

        var second = await client.ProvisionAsync(projectId, login.WorkspaceId);
        Assert.Equal(first.WorkspaceId, second.WorkspaceId);
        Assert.Equal(first.ConnectionId, second.ConnectionId);
        Assert.Null(second.ApiKey);

        using var keyClient = factory.CreateClient();
        keyClient.WithApiKey(first.ApiKey!);
        var search = await keyClient.GetFromJsonAsync<JsonElement>("/api/v1/integrations/products/search?pageSize=50&q=iPhone");
        Assert.True(search.GetProperty("totalCount").GetInt32() > 0);

        var keyId = search.GetProperty("items")[0].GetProperty("id").GetGuid();
        var availability = await keyClient.GetFromJsonAsync<JsonElement>(
            $"/api/v1/integrations/products/{keyId}/availability");
        Assert.True(availability.GetProperty("inStock").GetBoolean());
        Assert.True(availability.GetProperty("available").GetInt32() >= 0);

        var pricing = await keyClient.GetFromJsonAsync<JsonElement>(
            $"/api/v1/integrations/products/{keyId}/pricing?quantity=2&couponCode=WELCOME10");
        Assert.True(pricing.GetProperty("variants").GetArrayLength() >= 1);
        Assert.True(pricing.GetProperty("couponDiscount").GetDecimal() > 0);
    }

    [Fact]
    public async Task Integration_keys_cannot_use_workspace_admin_apis()
    {
        using var factory = new CommerceApiFactory();
        using var admin = factory.CreateClient();
        var login = await admin.LoginAsync();
        var provisioned = await admin.ProvisionAsync($"ga-project-{Guid.NewGuid():N}", login.WorkspaceId);

        using var keyClient = factory.CreateClient();
        keyClient.WithApiKey(provisioned.ApiKey!);
        using var response = await keyClient.GetAsync("/api/v1/integration/status");

        Assert.True(response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
            $"Expected 401/403 but got {(int)response.StatusCode}.");
    }

    [Fact]
    public async Task Disabled_connection_blocks_keys_and_reconnect_restores_access()
    {
        using var factory = new CommerceApiFactory();
        using var admin = factory.CreateClient();
        var login = await admin.LoginAsync();
        admin.Authorized(login.AccessToken);
        var provisioned = await admin.ProvisionAsync($"ga-project-{Guid.NewGuid():N}", login.WorkspaceId);

        using var keyClient = factory.CreateClient();
        keyClient.WithApiKey(provisioned.ApiKey!);
        Assert.Equal(HttpStatusCode.OK, (await keyClient.GetAsync("/api/v1/integrations/offers/active")).StatusCode);

        var disabled = await admin.PostAsync("/api/v1/integration/disable", null);
        Assert.Equal(HttpStatusCode.OK, disabled.StatusCode);
        var blocked = await keyClient.GetAsync("/api/v1/integrations/offers/active");
        Assert.Equal(HttpStatusCode.Unauthorized, blocked.StatusCode);

        var reconnected = await admin.PostAsJsonAsync("/api/v1/integration/reconnect",
            new { webhookUrl = "https://host.example/webhooks/commerce" });
        Assert.Equal(HttpStatusCode.OK, reconnected.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await keyClient.GetAsync("/api/v1/integrations/offers/active")).StatusCode);

        var revoked = await admin.PostAsync("/api/v1/integration/revoke", null);
        Assert.Equal(HttpStatusCode.OK, revoked.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await keyClient.GetAsync("/api/v1/integrations/offers/active")).StatusCode);
    }

    [Fact]
    public async Task Tenant_data_is_never_visible_to_another_tenant()
    {
        using var factory = new CommerceApiFactory();
        using var demo = factory.CreateClient();
        var demoLogin = await demo.LoginAsync();
        demo.Authorized(demoLogin.AccessToken);

        var demoProducts = await demo.GetFromJsonAsync<JsonElement>("/api/v1/products?pageSize=1");
        var demoProductId = demoProducts.GetProperty("items")[0].GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await demo.GetAsync($"/api/v1/products/{demoProductId}")).StatusCode);

        using var other = factory.CreateClient();
        var email = $"owner-{Guid.NewGuid():N}@example.com";
        var registration = await other.PostAsJsonAsync("/api/v1/auth/register", new
        {
            companyName = "Second Tenant",
            fullName = "Second Owner",
            email,
            password = "Password123!",
            workspaceName = "Second Store",
            currency = "EUR",
            seedDemoData = false
        });
        Assert.Equal(HttpStatusCode.Created, registration.StatusCode);
        var otherPayload = await registration.Content.ReadFromJsonAsync<JsonElement>();
        var otherToken = otherPayload.GetProperty("accessToken").GetString()!;
        other.Authorized(otherToken);

        var otherProducts = await other.GetFromJsonAsync<JsonElement>("/api/v1/products");
        Assert.Equal(0, otherProducts.GetProperty("totalCount").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/v1/products/{demoProductId}")).StatusCode);

        using var otherIntegration = factory.CreateClient();
        var provisioned = await otherIntegration.ProvisionAsync($"ga-project-{Guid.NewGuid():N}");
        otherIntegration.WithApiKey(provisioned.ApiKey!);
        var search = await otherIntegration.GetFromJsonAsync<JsonElement>("/api/v1/integrations/products/search");
        Assert.Equal(0, search.GetProperty("totalCount").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherIntegration.GetAsync($"/api/v1/integrations/products/{demoProductId}")).StatusCode);
    }

    [Fact]
    public async Task Outbox_retries_once_per_attempt_without_duplicates_and_host_outage_is_harmless()
    {
        using var factory = new CommerceApiFactory();
        using var admin = factory.CreateClient();
        var login = await admin.LoginAsync();
        admin.Authorized(login.AccessToken);

        await admin.ProvisionAsync($"ga-project-{Guid.NewGuid():N}", login.WorkspaceId,
            webhookUrl: "https://host.invalid/webhooks/commerce");

        factory.Webhooks.Respond = (_, _) => false;

        var sku = $"WH-{Guid.NewGuid():N}"[..12].ToUpperInvariant();
        var created = await admin.PostAsJsonAsync("/api/v1/products", new
        {
            name = "Webhook resilience product",
            sku,
            shortDescription = "Created during an outbox resilience test.",
            description = "Created during an outbox resilience test.",
            status = 1,
            costPrice = 10m,
            basePrice = 20m,
            taxRate = 0m,
            isFeatured = false
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        // Commerce keeps working while the host platform is unreachable.
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/v1/products")).StatusCode);

        var dispatcher = factory.Services.GetRequiredService<OutboxDispatcher>();
        Assert.Equal(0, await dispatcher.DispatchOnceAsync());

        var events = await admin.GetFromJsonAsync<JsonElement>("/api/v1/integration/events?limit=50");
        var productEvent = events.EnumerateArray()
            .First(e => e.GetProperty("type").GetString() == "commerce.product.created");
        Assert.Equal("Failed", productEvent.GetProperty("status").GetString());
        Assert.Equal(1, productEvent.GetProperty("attempts").GetInt32());

        var eventId = productEvent.GetProperty("id").GetGuid();
        var retry = await admin.PostAsync($"/api/v1/integration/events/{eventId}/retry", null);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);

        factory.Webhooks.Respond = (_, _) => true;
        Assert.Equal(1, await dispatcher.DispatchOnceAsync());
        Assert.Equal(0, await dispatcher.DispatchOnceAsync());

        Assert.Equal(2, factory.Webhooks.Requests.Count);
        Assert.Equal("https://host.invalid/webhooks/commerce", factory.Webhooks.Requests[0].Uri.ToString());
        Assert.Contains("sha256=", factory.Webhooks.Requests[0].Headers["X-Commerce-Signature"]);

        var deliveries = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/v1/integration/deliveries?eventId={eventId}");
        Assert.Equal(2, deliveries.GetArrayLength());
        Assert.Single(events.EnumerateArray(),
            e => e.GetProperty("type").GetString() == "commerce.product.created");
    }

    [Fact]
    public async Task New_tenant_can_run_the_full_sales_flow()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();

        var email = $"flow-{Guid.NewGuid():N}@example.test";
        using var register = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            companyName = "Flow Test Co",
            fullName = "Flow Tester",
            email,
            password = "FlowTest123!",
            workspaceName = "Flow Store",
            currency = "USD",
            seedDemoData = false
        });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);
        var auth = await register.Content.ReadFromJsonAsync<ApiTestClient.AuthPayload>(ApiTestClient.Json);
        client.Authorized(auth!.AccessToken);

        var category = await PostJsonAsync(client, "/api/v1/categories",
            new { name = "Lamps", parentId = (Guid?)null, description = "Lighting", isActive = true, sortOrder = 0 });
        var brand = await PostJsonAsync(client, "/api/v1/brands",
            new { name = "Northwind", logoUrl = (string?)null });

        var product = await PostJsonAsync(client, "/api/v1/products", new
        {
            name = "Desk Lamp",
            sku = "LAMP-001",
            shortDescription = "A lamp",
            description = "A desk lamp",
            categoryId = category.GetProperty("id").GetGuid(),
            brandId = brand.GetProperty("id").GetGuid(),
            status = "Active",
            costPrice = 40m,
            basePrice = 100m,
            compareAtPrice = (decimal?)null,
            taxRate = 0m,
            isFeatured = false,
            tags = "lighting",
            seoTitle = (string?)null,
            seoDescription = (string?)null,
            variants = new[]
            {
                new { name = "Default", sku = "LAMP-001-D", attributesJson = (string?)null,
                    costPrice = 40m, price = 100m, isActive = true, isDefault = true }
            },
            images = Array.Empty<string>()
        });
        var productId = product.GetProperty("id").GetGuid();
        var variantId = product.GetProperty("variants")[0].GetProperty("id").GetGuid();

        var warehouse = (await client.GetFromJsonAsync<JsonElement>("/api/v1/warehouses"))[0];
        var warehouseId = warehouse.GetProperty("id").GetGuid();

        using var adjust = await client.PostAsJsonAsync("/api/v1/inventory/adjust", new
        {
            warehouseId,
            variantId,
            quantityDelta = 10,
            note = "Opening stock"
        });
        Assert.Equal(HttpStatusCode.OK, adjust.StatusCode);

        var customer = await PostJsonAsync(client, "/api/v1/customers", new
        {
            firstName = "Dana",
            lastName = "Buyer",
            email = "dana@example.test",
            phone = "555-0100",
            companyName = (string?)null,
            notes = (string?)null,
            tags = "vip",
            isBusiness = false,
            externalSource = (string?)null,
            externalId = (string?)null
        });

        var now = DateTime.UtcNow;
        var coupon = await PostJsonAsync(client, "/api/v1/pricing/coupons", new
        {
            code = "FLOW10",
            type = "Percentage",
            value = 10m,
            minOrderSubtotal = 50m,
            startsAtUtc = now.AddHours(-1),
            endsAtUtc = now.AddDays(1),
            isActive = true,
            maxRedemptions = (int?)null
        });
        Assert.Equal("FLOW10", coupon.GetProperty("code").GetString());

        var offer = await PostJsonAsync(client, "/api/v1/pricing/offers", new
        {
            name = "Launch 20%",
            type = "Percentage",
            value = 20m,
            startsAtUtc = now.AddHours(-1),
            endsAtUtc = now.AddDays(1),
            isActive = true,
            appliesToAllProducts = true,
            productId = (Guid?)null,
            categoryId = (Guid?)null,
            minQuantity = 1
        });
        Assert.True(offer.GetProperty("isLive").GetBoolean());

        var quote = await PostJsonAsync(client, "/api/v1/pricing/quote",
            new { variantId, quantity = 2, couponCode = "FLOW10" });
        var price = quote.GetProperty("quote");
        Assert.Equal(80m, price.GetProperty("unitPrice").GetDecimal());
        Assert.Equal(20m, price.GetProperty("offerDiscount").GetDecimal());
        Assert.Equal(20m, quote.GetProperty("coupon").GetProperty("discountAmount").GetDecimal());

        var order = await PostJsonAsync(client, "/api/v1/orders", new
        {
            customerId = customer.GetProperty("id").GetGuid(),
            customerName = "Dana Buyer",
            customerEmail = "dana@example.test",
            customerPhone = (string?)null,
            items = new[] { new { variantId, quantity = 2 } },
            couponCode = "FLOW10",
            shippingTotal = 5m,
            notes = "Flow order",
            shippingAddressJson = (string?)null,
            source = "standalone",
            externalOrderId = (string?)null
        });
        var orderId = order.GetProperty("id").GetGuid();
        Assert.Equal(200m, order.GetProperty("subtotal").GetDecimal());
        Assert.Equal(60m, order.GetProperty("discountTotal").GetDecimal());
        Assert.Equal(145m, order.GetProperty("grandTotal").GetDecimal());
        Assert.Equal("Pending", order.GetProperty("status").GetString());

        using var confirm = await client.PostAsJsonAsync($"/api/v1/orders/{orderId}/status",
            new { status = "Confirmed", note = "Paid" });
        confirm.EnsureSuccessStatusCode();
        var confirmed = await confirm.Content.ReadFromJsonAsync<JsonElement>(ApiTestClient.Json);
        Assert.Equal("Confirmed", confirmed.GetProperty("status").GetString());

        var stock = await client.GetFromJsonAsync<JsonElement>(
            $"/api/v1/inventory/stock?search=LAMP-001-D");
        Assert.Equal(8, stock.GetProperty("items")[0].GetProperty("onHand").GetInt32());

        var invoice = await client.GetFromJsonAsync<JsonElement>($"/api/v1/orders/{orderId}/invoice");
        Assert.Equal(145m, invoice.GetProperty("amount").GetDecimal());

        var payment = await PostJsonAsync(client, "/api/v1/payments", new
        {
            orderId,
            amount = 145m,
            method = "Card",
            reference = "FLOW-PAY",
            notes = (string?)null,
            paidAtUtc = (DateTime?)null,
            customerId = (Guid?)null
        });
        Assert.Equal(145m, payment.GetProperty("amount").GetDecimal());

        var paid = await client.GetFromJsonAsync<JsonElement>($"/api/v1/orders/{orderId}");
        Assert.Equal("Paid", paid.GetProperty("paymentStatus").GetString());

        var dashboard = await client.GetFromJsonAsync<JsonElement>("/api/v1/dashboard");
        Assert.Equal(1, dashboard.GetProperty("orders").GetInt32());
        Assert.Equal(1, dashboard.GetProperty("products").GetInt32());
        Assert.True(dashboard.GetProperty("revenue").GetDecimal() > 0);

        var integration = await client.GetFromJsonAsync<JsonElement>("/api/v1/integration/events?limit=50");
        Assert.Contains(integration.EnumerateArray(),
            e => e.GetProperty("type").GetString() == "commerce.payment.recorded");
        Assert.Contains(integration.EnumerateArray(),
            e => e.GetProperty("type").GetString() == "commerce.order.created");
        Assert.Contains(integration.EnumerateArray(),
            e => e.GetProperty("type").GetString() == "commerce.product.created");

        Assert.NotEqual(Guid.Empty, productId);
    }

    private static async Task<JsonElement> PostJsonAsync(HttpClient client, string url, object body)
    {
        using var response = await client.PostAsJsonAsync(url, body, ApiTestClient.Json);
        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync();
            throw new Xunit.Sdk.XunitException($"POST {url} failed with {(int)response.StatusCode}: {detail}");
        }

        return await response.Content.ReadFromJsonAsync<JsonElement>(ApiTestClient.Json);
    }

    [Fact]
    public async Task Sso_endpoint_reports_not_configured_instead_of_faking_a_login()
    {
        using var factory = new CommerceApiFactory();
        using var client = factory.CreateClient();

        using var response = await client.PostAsJsonAsync("/api/v1/integrations/sso/exchange",
            new { launchToken = "client-controlled" });
        Assert.Equal(HttpStatusCode.NotImplemented, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("SSO_NOT_CONFIGURED", payload.GetProperty("error").GetProperty("code").GetString());
    }
}
