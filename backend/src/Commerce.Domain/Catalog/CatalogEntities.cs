using Commerce.Domain.Common;

namespace Commerce.Domain.Catalog;

public class Category : WorkspaceEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public Guid? ParentId { get; set; }
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public class Brand : WorkspaceEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? LogoUrl { get; set; }
}

public class Product : WorkspaceEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Sku { get; set; } = string.Empty;
    public string? ShortDescription { get; set; }
    public string? Description { get; set; }
    public Guid? CategoryId { get; set; }
    public Guid? BrandId { get; set; }
    public ProductStatus Status { get; set; } = ProductStatus.Draft;
    public decimal CostPrice { get; set; }
    public decimal BasePrice { get; set; }
    public decimal? CompareAtPrice { get; set; }
    public decimal TaxRate { get; set; }
    public string CurrencyCode { get; set; } = "USD";
    public bool IsFeatured { get; set; }
    public string? Tags { get; set; }
    public string? SeoTitle { get; set; }
    public string? SeoDescription { get; set; }
    public bool IsDeleted { get; set; }
}

public class ProductVariant : WorkspaceEntity
{
    public Guid ProductId { get; set; }
    public string Name { get; set; } = "Default";
    public string Sku { get; set; } = string.Empty;
    public string? AttributesJson { get; set; }
    public decimal CostPrice { get; set; }
    public decimal Price { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public bool IsDefault { get; set; }
}

public class ProductImage : WorkspaceEntity
{
    public Guid ProductId { get; set; }
    public string Url { get; set; } = string.Empty;
    public string? AltText { get; set; }
    public int SortOrder { get; set; }
}
