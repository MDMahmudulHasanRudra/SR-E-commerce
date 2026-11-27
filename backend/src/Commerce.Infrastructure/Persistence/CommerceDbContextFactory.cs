using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Commerce.Infrastructure.Persistence;

public sealed class CommerceDbContextFactory : IDesignTimeDbContextFactory<CommerceDbContext>
{
    public CommerceDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("COMMERCE_DB")
            ?? "Host=localhost;Port=5433;Database=commerce;Username=commerce;Password=commerce";
        var options = new DbContextOptionsBuilder<CommerceDbContext>()
            .UseNpgsql(connection, npgsql => npgsql.MigrationsAssembly(typeof(CommerceDbContext).Assembly.GetName().Name))
            .Options;

        var tenant = new TenantContext();
        tenant.SetSystem();
        return new CommerceDbContext(options, tenant);
    }
}
