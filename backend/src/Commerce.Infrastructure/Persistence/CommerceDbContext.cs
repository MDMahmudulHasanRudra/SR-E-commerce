using Commerce.Domain.Catalog;
using Commerce.Domain.Common;
using Commerce.Domain.Customers;
using Commerce.Domain.Identity;
using Commerce.Domain.Integrations;
using Commerce.Domain.Inventory;
using Commerce.Domain.Orders;
using Commerce.Domain.Payments;
using Commerce.Domain.Pricing;
using Commerce.Domain.Purchasing;
using Commerce.Infrastructure.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Persistence;

public class CommerceDbContext : DbContext
{
    private readonly ITenantContext _tenant;

    public CommerceDbContext(DbContextOptions<CommerceDbContext> options, ITenantContext tenant)
        : base(options) => _tenant = tenant;

    public Guid CurrentTenantId => _tenant.TenantId;
    public Guid CurrentWorkspaceId => _tenant.WorkspaceId;
    public bool FilterBypass => _tenant.IsSystem;

    public DbSet<CommerceTenant> Tenants => Set<CommerceTenant>();
    public DbSet<CommerceWorkspace> Workspaces => Set<CommerceWorkspace>();
    public DbSet<CommerceUser> Users => Set<CommerceUser>();
    public DbSet<CommerceMembership> Memberships => Set<CommerceMembership>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Brand> Brands => Set<Brand>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductVariant> ProductVariants => Set<ProductVariant>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();

    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<StockItem> StockItems => Set<StockItem>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();

    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerAddress> CustomerAddresses => Set<CustomerAddress>();

    public DbSet<Offer> Offers => Set<Offer>();
    public DbSet<Coupon> Coupons => Set<Coupon>();
    public DbSet<PriceChange> PriceChanges => Set<PriceChange>();

    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<OrderEvent> OrderEvents => Set<OrderEvent>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<OrderReturn> OrderReturns => Set<OrderReturn>();

    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderItem> PurchaseOrderItems => Set<PurchaseOrderItem>();
    public DbSet<GoodsReceipt> GoodsReceipts => Set<GoodsReceipt>();
    public DbSet<SupplierPayment> SupplierPayments => Set<SupplierPayment>();

    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Refund> Refunds => Set<Refund>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<TaxRate> TaxRates => Set<TaxRate>();

    public DbSet<AppConnection> AppConnections => Set<AppConnection>();
    public DbSet<ApiClient> ApiClients => Set<ApiClient>();
    public DbSet<OutboxEvent> OutboxEvents => Set<OutboxEvent>();
    public DbSet<DeliveryLog> DeliveryLogs => Set<DeliveryLog>();
    public DbSet<HostIdentityLink> HostIdentityLinks => Set<HostIdentityLink>();
    public DbSet<HostLaunchCode> HostLaunchCodes => Set<HostLaunchCode>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        // ---- Global tenant/workspace filters (defense in depth) ----
        b.Entity<Product>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<ProductVariant>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<ProductImage>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Category>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Brand>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Warehouse>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<StockItem>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<StockMovement>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Customer>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<CustomerAddress>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Offer>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Coupon>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<PriceChange>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Order>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<OrderItem>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<OrderEvent>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Invoice>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<OrderReturn>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Supplier>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<PurchaseOrder>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<PurchaseOrderItem>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<GoodsReceipt>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<SupplierPayment>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Payment>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Refund>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<Expense>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<TaxRate>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<AuditLog>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<CommerceWorkspace>().HasQueryFilter(e =>
            FilterBypass || e.TenantId == CurrentTenantId);
        b.Entity<CommerceUser>().HasQueryFilter(e =>
            FilterBypass || e.TenantId == CurrentTenantId);
        b.Entity<CommerceMembership>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<RefreshToken>().HasQueryFilter(e =>
            FilterBypass || e.TenantId == CurrentTenantId);
        b.Entity<AppConnection>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<ApiClient>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<OutboxEvent>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<DeliveryLog>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));
        b.Entity<HostIdentityLink>().HasQueryFilter(e =>
            FilterBypass || (e.TenantId == CurrentTenantId && (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)));

        // ---- Keys & indexes ----
        b.Entity<CommerceTenant>().HasIndex(e => e.Slug).IsUnique();
        b.Entity<CommerceWorkspace>().HasIndex(e => new { e.TenantId, e.Slug }).IsUnique();
        b.Entity<CommerceUser>().HasIndex(e => e.NormalizedEmail).IsUnique();
        b.Entity<CommerceMembership>().HasIndex(e => new { e.WorkspaceId, e.UserId }).IsUnique();
        b.Entity<RefreshToken>().HasIndex(e => e.TokenHash).IsUnique();

        b.Entity<Product>().HasIndex(e => new { e.WorkspaceId, e.Sku }).IsUnique();
        b.Entity<Product>().HasIndex(e => new { e.WorkspaceId, e.Status });
        b.Entity<Product>().HasIndex(e => new { e.WorkspaceId, e.Name });
        b.Entity<ProductVariant>().HasIndex(e => new { e.WorkspaceId, e.Sku }).IsUnique();
        b.Entity<ProductVariant>().HasIndex(e => new { e.ProductId });
        b.Entity<Category>().HasIndex(e => new { e.WorkspaceId, e.Slug }).IsUnique();
        b.Entity<Brand>().HasIndex(e => new { e.WorkspaceId, e.Slug }).IsUnique();

        b.Entity<Warehouse>().HasIndex(e => new { e.WorkspaceId, e.Code }).IsUnique();
        b.Entity<StockItem>().HasIndex(e => new { e.WorkspaceId, e.WarehouseId, e.VariantId }).IsUnique();
        b.Entity<StockItem>().HasIndex(e => new { e.WorkspaceId, e.VariantId });
        b.Entity<StockMovement>().HasIndex(e => new { e.WorkspaceId, e.VariantId, e.CreatedAtUtc });
        b.Entity<StockMovement>().HasIndex(e => new { e.WorkspaceId, e.WarehouseId, e.CreatedAtUtc });

        b.Entity<Customer>().HasIndex(e => new { e.WorkspaceId, e.Email });
        b.Entity<Customer>().HasIndex(e => new { e.WorkspaceId, e.Phone });
        b.Entity<Customer>().HasIndex(e => new { e.WorkspaceId, e.ExternalSource, e.ExternalId });
        b.Entity<CustomerAddress>().HasIndex(e => new { e.CustomerId });

        b.Entity<Offer>().HasIndex(e => new { e.WorkspaceId, e.IsActive, e.EndsAtUtc });
        b.Entity<Coupon>().HasIndex(e => new { e.WorkspaceId, e.Code }).IsUnique();
        b.Entity<PriceChange>().HasIndex(e => new { e.WorkspaceId, e.VariantId, e.CreatedAtUtc });

        b.Entity<Order>().HasIndex(e => new { e.WorkspaceId, e.OrderNumber }).IsUnique();
        b.Entity<Order>().HasIndex(e => new { e.WorkspaceId, e.Status, e.PlacedAtUtc });
        b.Entity<Order>().HasIndex(e => new { e.WorkspaceId, e.CustomerId });
        b.Entity<OrderItem>().HasIndex(e => e.OrderId);
        b.Entity<OrderEvent>().HasIndex(e => e.OrderId);
        b.Entity<Invoice>().HasIndex(e => new { e.WorkspaceId, e.InvoiceNumber }).IsUnique();
        b.Entity<OrderReturn>().HasIndex(e => new { e.WorkspaceId, e.OrderId });

        b.Entity<Supplier>().HasIndex(e => new { e.WorkspaceId, e.Name });
        b.Entity<PurchaseOrder>().HasIndex(e => new { e.WorkspaceId, e.PoNumber }).IsUnique();
        b.Entity<PurchaseOrderItem>().HasIndex(e => e.PurchaseOrderId);
        b.Entity<GoodsReceipt>().HasIndex(e => e.PurchaseOrderId);
        b.Entity<SupplierPayment>().HasIndex(e => new { e.WorkspaceId, e.SupplierId });

        b.Entity<Payment>().HasIndex(e => new { e.WorkspaceId, e.OrderId });
        b.Entity<Payment>().HasIndex(e => new { e.WorkspaceId, e.PaidAtUtc });
        b.Entity<Refund>().HasIndex(e => new { e.WorkspaceId, e.OrderId });
        b.Entity<Expense>().HasIndex(e => new { e.WorkspaceId, e.PaidAtUtc });

        b.Entity<AppConnection>().HasIndex(e => new { e.HostPlatform, e.HostCustomerId, e.HostProjectId }).IsUnique();
        b.Entity<AppConnection>().HasIndex(e => new { e.WorkspaceId, e.Status });
        b.Entity<AppConnection>().Property(e => e.HostSignInUrl).HasMaxLength(500);
        b.Entity<ApiClient>().HasIndex(e => e.KeyHash).IsUnique();
        b.Entity<OutboxEvent>().HasIndex(e => new { e.Status, e.NextAttemptAtUtc });
        b.Entity<OutboxEvent>().HasIndex(e => new { e.WorkspaceId, e.OccurredAtUtc });
        b.Entity<DeliveryLog>().HasIndex(e => new { e.OutboxEventId, e.Attempt });
        // One link per host user per connection; one host user per Commerce user per connection.
        b.Entity<HostIdentityLink>().HasIndex(e => new { e.ConnectionId, e.Subject }).IsUnique();
        b.Entity<HostIdentityLink>().HasIndex(e => new { e.ConnectionId, e.UserId }).IsUnique();
        b.Entity<HostLaunchCode>().HasIndex(e => e.CodeHash).IsUnique();
        b.Entity<HostLaunchCode>().HasIndex(e => e.ExpiresAtUtc);
        b.Entity<HostLaunchCode>().Property(e => e.Subject).HasMaxLength(128);
        b.Entity<HostLaunchCode>().Property(e => e.DisplayName).HasMaxLength(120);
        b.Entity<HostLaunchCode>().Property(e => e.ReturnPath).HasMaxLength(300);
        b.Entity<HostIdentityLink>().Property(e => e.Subject).HasMaxLength(128);

        // Relationships for critical invariants / cascades.
        b.Entity<ProductVariant>().HasOne<Product>().WithMany()
            .HasForeignKey(e => e.ProductId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<ProductImage>().HasOne<Product>().WithMany()
            .HasForeignKey(e => e.ProductId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<OrderItem>().HasOne<Order>().WithMany()
            .HasForeignKey(e => e.OrderId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<OrderEvent>().HasOne<Order>().WithMany()
            .HasForeignKey(e => e.OrderId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Invoice>().HasOne<Order>().WithMany()
            .HasForeignKey(e => e.OrderId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<OrderReturn>().HasOne<Order>().WithMany()
            .HasForeignKey(e => e.OrderId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<CustomerAddress>().HasOne<Customer>().WithMany()
            .HasForeignKey(e => e.CustomerId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<PurchaseOrderItem>().HasOne<PurchaseOrder>().WithMany()
            .HasForeignKey(e => e.PurchaseOrderId).OnDelete(DeleteBehavior.Cascade);

        // Monetary precision everywhere. Never use floating point for money.
        foreach (var entityType in b.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties().Where(p => p.ClrType == typeof(decimal) || p.ClrType == typeof(decimal?)))
            {
                property.SetPrecision(18);
                property.SetScale(2);
            }
        }
    }

    public override int SaveChanges()
    {
        Stamp();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        Stamp();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void Stamp()
    {
        foreach (var entry in ChangeTracker.Entries<TenantEntity>())
        {
            if (entry.State == EntityState.Added && entry.Entity.TenantId == Guid.Empty)
            {
                if (!_tenant.HasTenant && !_tenant.IsSystem)
                    throw new InvalidOperationException("Tenant context was not established for a tenant-owned write.");
                entry.Entity.TenantId = _tenant.TenantId;
            }

            if (entry.State == EntityState.Added && entry.Entity is WorkspaceEntity workspace && workspace.WorkspaceId == Guid.Empty)
            {
                if (_tenant.WorkspaceId == Guid.Empty && !_tenant.IsSystem)
                    throw new InvalidOperationException("Workspace context was not established for a workspace-owned write.");
                workspace.WorkspaceId = _tenant.WorkspaceId;
            }

            if (entry.State is EntityState.Added or EntityState.Modified)
            {
                entry.Entity.UpdatedAtUtc = DateTime.UtcNow;
                if (entry.State == EntityState.Added && entry.Entity.CreatedAtUtc == default)
                    entry.Entity.CreatedAtUtc = DateTime.UtcNow;
            }
        }

        foreach (var entry in ChangeTracker.Entries<OutboxEvent>())
        {
            if (entry.State == EntityState.Added && entry.Entity.TenantId == Guid.Empty)
                entry.Entity.TenantId = _tenant.TenantId;
            if (entry.State == EntityState.Added && entry.Entity.WorkspaceId == Guid.Empty)
                entry.Entity.WorkspaceId = _tenant.WorkspaceId;
        }

        foreach (var entry in ChangeTracker.Entries<DeliveryLog>())
        {
            if (entry.State == EntityState.Added && entry.Entity.TenantId == Guid.Empty)
                entry.Entity.TenantId = _tenant.TenantId;
            if (entry.State == EntityState.Added && entry.Entity.WorkspaceId == Guid.Empty)
                entry.Entity.WorkspaceId = _tenant.WorkspaceId;
        }
    }
}
