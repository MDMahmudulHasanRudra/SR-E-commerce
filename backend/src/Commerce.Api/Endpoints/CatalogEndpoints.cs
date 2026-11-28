using System.Text;
using Commerce.Domain;
using Commerce.Infrastructure.Services;

namespace Commerce.Api.Endpoints;

public static class CatalogEndpoints
{
    public static void MapCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        var products = app.MapGroup("/api/v1/products").WithTags("Products");

        products.MapGet("", async (string? search, Guid? categoryId, Guid? brandId, ProductStatus? status,
            bool? lowStock, string? sort, int? page, int? pageSize, CatalogService catalog, CancellationToken ct) =>
            Results.Ok(await catalog.ListProductsAsync(search, categoryId, brandId, status, lowStock ?? false,
                sort, page ?? 1, pageSize ?? 20, ct)))
            .RequireAuthorization("Member");

        products.MapGet("/export", async (CatalogService catalog, CancellationToken ct) =>
        {
            var csv = await catalog.ExportProductsCsvAsync(ct);
            return Results.File(Encoding.UTF8.GetBytes(csv), "text/csv; charset=utf-8",
                $"products-{DateTime.UtcNow:yyyyMMdd}.csv");
        }).RequireAuthorization("Member");

        products.MapPost("/import", async (HttpRequest request, CatalogService catalog, CancellationToken ct) =>
        {
            if (!request.HasFormContentType && request.ContentType is not null
                && !request.ContentType.Contains("csv", StringComparison.OrdinalIgnoreCase)
                && !request.ContentType.Contains("text/plain", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = new { code = "VALIDATION_ERROR", message = "Send a CSV body with Content-Type text/csv." } });
            var result = await catalog.ImportProductsCsvAsync(request.Body, ct);
            return Results.Ok(result);
        }).RequireAuthorization("Manager");

        products.MapGet("/{id:guid}", async (Guid id, CatalogService catalog, CancellationToken ct) =>
            Results.Ok(await catalog.GetProductAsync(id, ct))).RequireAuthorization("Member");

        products.MapGet("/{id:guid}/price-history", async (Guid id, CatalogService catalog, CancellationToken ct) =>
            Results.Ok(await catalog.GetPriceHistoryAsync(id, ct))).RequireAuthorization("Member");

        products.MapPost("", async (ProductInput input, CatalogService catalog, CancellationToken ct) =>
        {
            var product = await catalog.CreateProductAsync(input, ct);
            return Results.Created($"/api/v1/products/{product.Id}", product);
        }).RequireAuthorization("Manager");

        products.MapPut("/{id:guid}", async (Guid id, ProductInput input, CatalogService catalog, CancellationToken ct) =>
            Results.Ok(await catalog.UpdateProductAsync(id, input, ct))).RequireAuthorization("Manager");

        products.MapDelete("/{id:guid}", async (Guid id, CatalogService catalog, CancellationToken ct) =>
        {
            await catalog.DeleteProductAsync(id, ct);
            return Results.NoContent();
        }).RequireAuthorization("Manager");

        var categories = app.MapGroup("/api/v1/categories").WithTags("Categories");
        categories.MapGet("", async (CatalogService catalog, CancellationToken ct) =>
            Results.Ok(await catalog.ListCategoriesAsync(ct))).RequireAuthorization("Member");
        categories.MapPost("", async (CategoryInput input, CatalogService catalog, CancellationToken ct) =>
            Results.Created("/api/v1/categories", await catalog.CreateCategoryAsync(input, ct))).RequireAuthorization("Manager");
        categories.MapPut("/{id:guid}", async (Guid id, CategoryInput input, CatalogService catalog, CancellationToken ct) =>
            Results.Ok(await catalog.UpdateCategoryAsync(id, input, ct))).RequireAuthorization("Manager");
        categories.MapDelete("/{id:guid}", async (Guid id, CatalogService catalog, CancellationToken ct) =>
        {
            await catalog.DeleteCategoryAsync(id, ct);
            return Results.NoContent();
        }).RequireAuthorization("Manager");

        var brands = app.MapGroup("/api/v1/brands").WithTags("Brands");
        brands.MapGet("", async (CatalogService catalog, CancellationToken ct) =>
            Results.Ok(await catalog.ListBrandsAsync(ct))).RequireAuthorization("Member");
        brands.MapPost("", async (BrandInput input, CatalogService catalog, CancellationToken ct) =>
            Results.Created("/api/v1/brands", await catalog.CreateBrandAsync(input, ct))).RequireAuthorization("Manager");
        brands.MapPut("/{id:guid}", async (Guid id, BrandInput input, CatalogService catalog, CancellationToken ct) =>
            Results.Ok(await catalog.UpdateBrandAsync(id, input, ct))).RequireAuthorization("Manager");
        brands.MapDelete("/{id:guid}", async (Guid id, CatalogService catalog, CancellationToken ct) =>
        {
            await catalog.DeleteBrandAsync(id, ct);
            return Results.NoContent();
        }).RequireAuthorization("Manager");
    }
}
