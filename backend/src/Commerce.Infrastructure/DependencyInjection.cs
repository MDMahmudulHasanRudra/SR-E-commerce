using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Integrations;
using Commerce.Infrastructure.Options;
using Commerce.Infrastructure.Persistence;
using Commerce.Infrastructure.Seeding;
using Commerce.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Commerce.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddCommerceInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<AuthOptions>(config.GetSection("Auth"));
        services.Configure<IntegrationOptions>(config.GetSection("GetAssist"));
        services.Configure<HostPlatformOptions>(config.GetSection("HostPlatform"));

        var bootProvider = config["Database:Provider"]?.Trim().ToLowerInvariant() ?? "postgres";
        var bootConnectionString = config.GetConnectionString("Default")
            ?? "Host=localhost;Port=5433;Database=commerce;Username=commerce;Password=commerce";

        services.AddDbContext<CommerceDbContext>((sp, options) =>
        {
            // Resolve configuration at context construction time so test hosts and
            // late-bound configuration can switch providers without rebuilding DI.
            var configuration = sp.GetRequiredService<IConfiguration>();
            var provider = configuration["Database:Provider"]?.Trim().ToLowerInvariant() ?? bootProvider;
            var connectionString = configuration.GetConnectionString("Default") ?? bootConnectionString;
            if (provider == "sqlite")
                options.UseSqlite(connectionString);
            else
                options.UseNpgsql(connectionString, npgsql =>
                    npgsql.MigrationsAssembly(typeof(CommerceDbContext).Assembly.GetName().Name));
        });

        services.AddScoped<TenantContext>();
        services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContext>());

        services.AddScoped<DemoDataSeeder>();
        services.AddScoped<AuthService>();
        services.AddScoped<AuditService>();
        services.AddScoped<OutboxService>();
        services.AddScoped<PricingService>();
        services.AddScoped<CatalogService>();
        services.AddScoped<InventoryService>();
        services.AddScoped<CustomerService>();
        services.AddScoped<OrderService>();
        services.AddScoped<PaymentService>();
        services.AddScoped<PurchasingService>();
        services.AddScoped<ReportingService>();
        services.AddScoped<SettingsService>();
        services.AddScoped<ApiKeyService>();
        services.AddScoped<ProvisioningService>();
        services.AddScoped<HostSignInService>();
        services.AddScoped<HostConnectionService>();
        services.AddScoped<IntegrationQueryService>();
        services.AddScoped<IntegrationAdminService>();

        services.AddHttpClient("webhooks", client =>
        {
            client.Timeout = TimeSpan.FromSeconds(12);
            client.DefaultRequestHeaders.Add("User-Agent", "Commerce-ERP/1.0");
        });
        services.AddHostedService<OutboxDispatcher>();

        return services;
    }
}
