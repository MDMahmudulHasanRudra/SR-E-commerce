using Commerce.Domain.Common;

namespace Commerce.Domain.Customers;

public class Customer : WorkspaceEntity
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? CompanyName { get; set; }
    public string? Notes { get; set; }
    public string? Tags { get; set; }
    public bool IsBusiness { get; set; }
    public string? ExternalSource { get; set; }
    public string? ExternalId { get; set; }
    public bool IsDeleted { get; set; }

    public string DisplayName => string.IsNullOrWhiteSpace(CompanyName)
        ? $"{FirstName} {LastName}".Trim()
        : CompanyName!;
}

public class CustomerAddress : WorkspaceEntity
{
    public Guid CustomerId { get; set; }
    public string Type { get; set; } = "shipping";
    public string Line1 { get; set; } = string.Empty;
    public string? Line2 { get; set; }
    public string City { get; set; } = string.Empty;
    public string? State { get; set; }
    public string? PostalCode { get; set; }
    public string Country { get; set; } = string.Empty;
    public bool IsDefault { get; set; }
}
