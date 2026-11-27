using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Customers;
using Commerce.Domain.Orders;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Services;

public sealed record CustomerInput(string FirstName, string LastName, string? Email, string? Phone,
    string? CompanyName, string? Notes, string? Tags, bool IsBusiness, string? ExternalSource, string? ExternalId);
public sealed record AddressInput(string Type, string Line1, string? Line2, string City, string? State,
    string? PostalCode, string Country, bool IsDefault);
public sealed record AddressView(Guid Id, string Type, string Line1, string? Line2, string City,
    string? State, string? PostalCode, string Country, bool IsDefault);
public sealed record CustomerOrderRow(Guid Id, string OrderNumber, OrderStatus Status, decimal GrandTotal,
    string CurrencyCode, DateTime PlacedAtUtc);
public sealed record CustomerView(Guid Id, string DisplayName, string FirstName, string LastName, string? Email,
    string? Phone, string? CompanyName, string? Notes, string? Tags, bool IsBusiness, string? ExternalSource,
    string? ExternalId, int OrderCount, decimal TotalSpent, DateTime? LastOrderAtUtc,
    IReadOnlyList<AddressView> Addresses, IReadOnlyList<CustomerOrderRow> RecentOrders, DateTime CreatedAtUtc);
public sealed record CustomerListItem(Guid Id, string DisplayName, string? Email, string? Phone,
    string? CompanyName, bool IsBusiness, string? Tags, int OrderCount, decimal TotalSpent,
    DateTime? LastOrderAtUtc, string? ExternalSource);

public sealed class CustomerService
{
    private readonly CommerceDbContext _db;
    private readonly AuditService _audit;
    private readonly OutboxService _outbox;

    public CustomerService(CommerceDbContext db, AuditService audit, OutboxService outbox)
    {
        _db = db;
        _audit = audit;
        _outbox = outbox;
    }

    public async Task<PagedResult<CustomerListItem>> ListAsync(string? search, string? tag, bool? isBusiness,
        int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = _db.Customers.AsNoTracking().Where(c => !c.IsDeleted);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(c => c.FirstName.ToLower().Contains(term) || c.LastName.ToLower().Contains(term)
                || (c.Email != null && c.Email.ToLower().Contains(term))
                || (c.Phone != null && c.Phone.Contains(term))
                || (c.CompanyName != null && c.CompanyName.ToLower().Contains(term)));
        }
        if (!string.IsNullOrWhiteSpace(tag)) query = query.Where(c => c.Tags != null && c.Tags.ToLower().Contains(tag.ToLower()));
        if (isBusiness is not null) query = query.Where(c => c.IsBusiness == isBusiness);

        var total = await query.CountAsync(ct);
        var customers = await query.OrderByDescending(c => c.CreatedAtUtc)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var ids = customers.Select(c => c.Id).ToList();
        var stats = await OrderStatsAsync(ids, ct);

        var items = customers.Select(c =>
        {
            var s = stats.GetValueOrDefault(c.Id);
            return new CustomerListItem(c.Id, c.DisplayName, c.Email, c.Phone, c.CompanyName, c.IsBusiness,
                c.Tags, s.Count, s.Total, s.Last, c.ExternalSource);
        }).ToList();

        return new PagedResult<CustomerListItem>(items, page, pageSize, total);
    }

    public async Task<CustomerView> GetAsync(Guid id, CancellationToken ct = default)
    {
        var c = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Customer not found.");
        var addresses = await _db.CustomerAddresses.AsNoTracking().Where(a => a.CustomerId == id)
            .OrderByDescending(a => a.IsDefault).ToListAsync(ct);
        var orders = await _db.Orders.AsNoTracking().Where(o => o.CustomerId == id)
            .OrderByDescending(o => o.PlacedAtUtc).Take(20).ToListAsync(ct);
        var stats = await OrderStatsAsync([id], ct);
        var s = stats.GetValueOrDefault(id);

        return new CustomerView(c.Id, c.DisplayName, c.FirstName, c.LastName, c.Email, c.Phone, c.CompanyName,
            c.Notes, c.Tags, c.IsBusiness, c.ExternalSource, c.ExternalId, s.Count, s.Total, s.Last,
            addresses.Select(a => new AddressView(a.Id, a.Type, a.Line1, a.Line2, a.City, a.State, a.PostalCode, a.Country, a.IsDefault)).ToList(),
            orders.Select(o => new CustomerOrderRow(o.Id, o.OrderNumber, o.Status, o.GrandTotal, o.CurrencyCode, o.PlacedAtUtc)).ToList(),
            c.CreatedAtUtc);
    }

    public async Task<CustomerView> CreateAsync(CustomerInput input, CancellationToken ct = default)
    {
        Validate(input);
        var customer = new Customer
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            FirstName = input.FirstName.Trim(),
            LastName = input.LastName.Trim(),
            Email = string.IsNullOrWhiteSpace(input.Email) ? null : input.Email.Trim().ToLowerInvariant(),
            Phone = string.IsNullOrWhiteSpace(input.Phone) ? null : input.Phone.Trim(),
            CompanyName = string.IsNullOrWhiteSpace(input.CompanyName) ? null : input.CompanyName.Trim(),
            Notes = input.Notes?.Trim(),
            Tags = input.Tags?.Trim(),
            IsBusiness = input.IsBusiness,
            ExternalSource = input.ExternalSource?.Trim(),
            ExternalId = input.ExternalId?.Trim()
        };
        await EnsureExternalIdAvailableAsync(customer.ExternalSource, customer.ExternalId, null, ct);
        _db.Customers.Add(customer);
        _audit.Record("customer.created", "Customer", customer.Id.ToString(), customer.DisplayName);
        await _db.SaveChangesAsync(ct);
        return await GetAsync(customer.Id, ct);
    }

    public async Task<CustomerView> UpdateAsync(Guid id, CustomerInput input, CancellationToken ct = default)
    {
        Validate(input);
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Customer not found.");

        var externalSource = input.ExternalSource?.Trim();
        var externalId = input.ExternalId?.Trim();
        await EnsureExternalIdAvailableAsync(externalSource, externalId, id, ct);

        customer.FirstName = input.FirstName.Trim();
        customer.LastName = input.LastName.Trim();
        customer.Email = string.IsNullOrWhiteSpace(input.Email) ? null : input.Email.Trim().ToLowerInvariant();
        customer.Phone = string.IsNullOrWhiteSpace(input.Phone) ? null : input.Phone.Trim();
        customer.CompanyName = string.IsNullOrWhiteSpace(input.CompanyName) ? null : input.CompanyName.Trim();
        customer.Notes = input.Notes?.Trim();
        customer.Tags = input.Tags?.Trim();
        customer.IsBusiness = input.IsBusiness;
        customer.ExternalSource = externalSource;
        customer.ExternalId = externalId;
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Customer not found.");
        customer.IsDeleted = true;
        customer.ExternalId = null;
        _audit.Record("customer.deleted", "Customer", customer.Id.ToString(), customer.DisplayName);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<AddressView> AddAddressAsync(Guid customerId, AddressInput input, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(input.Line1) || string.IsNullOrWhiteSpace(input.City) || string.IsNullOrWhiteSpace(input.Country))
            throw new DomainException(DomainErrors.Validation, "Address line 1, city and country are required.");
        if (!await _db.Customers.AnyAsync(c => c.Id == customerId && !c.IsDeleted, ct))
            throw new DomainException(DomainErrors.NotFound, "Customer not found.");

        if (input.IsDefault)
            foreach (var a in await _db.CustomerAddresses.Where(a => a.CustomerId == customerId).ToListAsync(ct))
                a.IsDefault = false;

        var address = new CustomerAddress
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            CustomerId = customerId,
            Type = string.IsNullOrWhiteSpace(input.Type) ? "shipping" : input.Type.ToLowerInvariant(),
            Line1 = input.Line1.Trim(),
            Line2 = input.Line2?.Trim(),
            City = input.City.Trim(),
            State = input.State?.Trim(),
            PostalCode = input.PostalCode?.Trim(),
            Country = input.Country.Trim(),
            IsDefault = input.IsDefault
        };
        _db.CustomerAddresses.Add(address);
        await _db.SaveChangesAsync(ct);
        return new AddressView(address.Id, address.Type, address.Line1, address.Line2, address.City,
            address.State, address.PostalCode, address.Country, address.IsDefault);
    }

    public async Task DeleteAddressAsync(Guid customerId, Guid addressId, CancellationToken ct = default)
    {
        var address = await _db.CustomerAddresses.FirstOrDefaultAsync(a => a.Id == addressId && a.CustomerId == customerId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Address not found.");
        _db.CustomerAddresses.Remove(address);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<CustomerView> LinkExternalAsync(Guid id, string source, string externalId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(source) || string.IsNullOrWhiteSpace(externalId))
            throw new DomainException(DomainErrors.Validation, "Source system and external ID are required.");
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Customer not found.");
        await EnsureExternalIdAvailableAsync(source, externalId, id, ct);
        customer.ExternalSource = source.Trim();
        customer.ExternalId = externalId.Trim();
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<CustomerView> UnlinkExternalAsync(Guid id, CancellationToken ct = default)
    {
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Customer not found.");
        customer.ExternalSource = null;
        customer.ExternalId = null;
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<IReadOnlyList<CustomerListItem>> FindDuplicatesAsync(string? email, string? phone, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(phone)) return [];
        var normEmail = email?.Trim().ToLowerInvariant();
        var normPhone = phone?.Trim();
        var customers = await _db.Customers.AsNoTracking().Where(c => !c.IsDeleted &&
            ((normEmail != null && c.Email == normEmail) || (normPhone != null && c.Phone == normPhone))).ToListAsync(ct);
        return customers.Select(c => new CustomerListItem(c.Id, c.DisplayName, c.Email, c.Phone, c.CompanyName,
            c.IsBusiness, c.Tags, 0, 0m, null, c.ExternalSource)).ToList();
    }

    private async Task<Dictionary<Guid, (int Count, decimal Total, DateTime? Last)>> OrderStatsAsync(
        List<Guid> customerIds, CancellationToken ct)
    {
        if (customerIds.Count == 0) return [];
        var rows = await _db.Orders.AsNoTracking()
            .Where(o => o.CustomerId != null && customerIds.Contains(o.CustomerId.Value) && o.Status != OrderStatus.Cancelled)
            .GroupBy(o => o.CustomerId!.Value)
            .Select(g => new
            {
                CustomerId = g.Key,
                Count = g.Count(),
                Total = g.Sum(o => o.GrandTotal),
                Last = g.Max(o => (DateTime?)o.PlacedAtUtc)
            }).ToListAsync(ct);
        return rows.ToDictionary(r => r.CustomerId, r => (r.Count, r.Total, r.Last));
    }

    private async Task EnsureExternalIdAvailableAsync(string? source, string? externalId, Guid? excludeId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(source) || string.IsNullOrWhiteSpace(externalId)) return;
        var exists = await _db.Customers.AnyAsync(c => c.Id != excludeId && c.ExternalSource == source && c.ExternalId == externalId, ct);
        if (exists)
            throw new DomainException(DomainErrors.Conflict,
                "This external customer reference is already linked to another customer.");
    }

    private static void Validate(CustomerInput input)
    {
        if (string.IsNullOrWhiteSpace(input.FirstName) && string.IsNullOrWhiteSpace(input.LastName)
            && string.IsNullOrWhiteSpace(input.CompanyName))
            throw new DomainException(DomainErrors.Validation, "Provide a customer name or company name.");
        if (!string.IsNullOrWhiteSpace(input.Email) && !input.Email.Contains('@'))
            throw new DomainException(DomainErrors.Validation, "Email address is not valid.");
    }
}
