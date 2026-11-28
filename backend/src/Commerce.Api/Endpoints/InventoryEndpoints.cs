using Commerce.Domain;
using Commerce.Infrastructure.Services;

namespace Commerce.Api.Endpoints;

public sealed record ReorderStockRequest(Guid WarehouseId, Guid VariantId, int ReorderPoint, int ReorderQuantity);

public static class InventoryEndpoints
{
    public static void MapInventoryEndpoints(this IEndpointRouteBuilder app)
    {
        var warehouses = app.MapGroup("/api/v1/warehouses").WithTags("Warehouses");
        warehouses.MapGet("", async (InventoryService inventory, CancellationToken ct) =>
            Results.Ok(await inventory.ListWarehousesAsync(ct))).RequireAuthorization("Member");
        warehouses.MapPost("", async (WarehouseInput input, InventoryService inventory, CancellationToken ct) =>
            Results.Created("/api/v1/warehouses", await inventory.CreateWarehouseAsync(input, ct)))
            .RequireAuthorization("Manager");
        warehouses.MapPut("/{id:guid}", async (Guid id, WarehouseInput input, InventoryService inventory, CancellationToken ct) =>
            Results.Ok(await inventory.UpdateWarehouseAsync(id, input, ct))).RequireAuthorization("Manager");
        warehouses.MapDelete("/{id:guid}", async (Guid id, InventoryService inventory, CancellationToken ct) =>
        {
            await inventory.DeleteWarehouseAsync(id, ct);
            return Results.NoContent();
        }).RequireAuthorization("Manager");

        var stock = app.MapGroup("/api/v1/inventory").WithTags("Inventory");
        stock.MapGet("/stock", async (string? search, Guid? warehouseId, bool? lowStock, int? page, int? pageSize,
            InventoryService inventory, CancellationToken ct) =>
            Results.Ok(await inventory.ListStockAsync(search, warehouseId, lowStock ?? false,
                page ?? 1, pageSize ?? 20, ct))).RequireAuthorization("Member");

        stock.MapGet("/low-stock", async (InventoryService inventory, CancellationToken ct) =>
            Results.Ok(await inventory.LowStockAsync(ct))).RequireAuthorization("Member");

        stock.MapPost("/adjust", async (AdjustStockRequest request, InventoryService inventory, CancellationToken ct) =>
            Results.Ok(await inventory.AdjustAsync(request, ct))).RequireAuthorization("Staff");

        stock.MapPost("/transfer", async (TransferStockRequest request, InventoryService inventory, CancellationToken ct) =>
        {
            await inventory.TransferAsync(request, ct);
            return Results.Ok(new { transferred = true });
        }).RequireAuthorization("Manager");

        stock.MapPut("/reorder", async (ReorderStockRequest request, InventoryService inventory, CancellationToken ct) =>
        {
            await inventory.UpdateReorderSettingsAsync(request.WarehouseId, request.VariantId,
                new ReorderSettingsRequest(request.ReorderPoint, request.ReorderQuantity), ct);
            return Results.Ok(new { updated = true });
        }).RequireAuthorization("Manager");

        stock.MapGet("/movements", async (Guid? variantId, Guid? warehouseId, StockMovementType? type,
            int? page, int? pageSize, InventoryService inventory, CancellationToken ct) =>
            Results.Ok(await inventory.ListMovementsAsync(variantId, warehouseId, type,
                page ?? 1, pageSize ?? 25, ct))).RequireAuthorization("Member");
    }
}
