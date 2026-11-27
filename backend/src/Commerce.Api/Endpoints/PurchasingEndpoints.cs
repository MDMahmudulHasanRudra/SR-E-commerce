using Commerce.Domain;
using Commerce.Infrastructure.Services;

namespace Commerce.Api.Endpoints;

public static class PurchasingEndpoints
{
    public static void MapPurchasingEndpoints(this IEndpointRouteBuilder app)
    {
        var suppliers = app.MapGroup("/api/v1/suppliers").WithTags("Suppliers");
        suppliers.MapGet("", async (PurchasingService service, CancellationToken ct) =>
            Results.Ok(await service.ListSuppliersAsync(ct))).RequireAuthorization("Member");
        suppliers.MapPost("", async (SupplierInput input, PurchasingService service, CancellationToken ct) =>
            Results.Created("/api/v1/suppliers", await service.CreateSupplierAsync(input, ct)))
            .RequireAuthorization("Manager");
        suppliers.MapPut("/{id:guid}", async (Guid id, SupplierInput input, PurchasingService service, CancellationToken ct) =>
            Results.Ok(await service.UpdateSupplierAsync(id, input, ct))).RequireAuthorization("Manager");
        suppliers.MapDelete("/{id:guid}", async (Guid id, PurchasingService service, CancellationToken ct) =>
        {
            await service.DeleteSupplierAsync(id, ct);
            return Results.NoContent();
        }).RequireAuthorization("Manager");

        var purchaseOrders = app.MapGroup("/api/v1/purchase-orders").WithTags("Purchase Orders");
        purchaseOrders.MapGet("", async (PurchaseOrderStatus? status, string? search, int? page, int? pageSize,
            PurchasingService service, CancellationToken ct) =>
            Results.Ok(await service.ListPurchaseOrdersAsync(status, search, page ?? 1, pageSize ?? 20, ct)))
            .RequireAuthorization("Member");
        purchaseOrders.MapGet("/{id:guid}", async (Guid id, PurchasingService service, CancellationToken ct) =>
            Results.Ok(await service.GetPurchaseOrderAsync(id, ct))).RequireAuthorization("Member");
        purchaseOrders.MapPost("", async (PurchaseOrderInput input, PurchasingService service, CancellationToken ct) =>
        {
            var po = await service.CreatePurchaseOrderAsync(input, ct);
            return Results.Created($"/api/v1/purchase-orders/{po.Id}", po);
        }).RequireAuthorization("Manager");
        purchaseOrders.MapPost("/{id:guid}/order", async (Guid id, PurchasingService service, CancellationToken ct) =>
            Results.Ok(await service.MarkOrderedAsync(id, ct))).RequireAuthorization("Manager");
        purchaseOrders.MapPost("/{id:guid}/receive", async (Guid id, ReceiveInput input, PurchasingService service, CancellationToken ct) =>
            Results.Ok(await service.ReceiveAsync(id, input, ct))).RequireAuthorization("Manager");
        purchaseOrders.MapPost("/{id:guid}/cancel", async (Guid id, PurchasingService service, CancellationToken ct) =>
            Results.Ok(await service.CancelAsync(id, ct))).RequireAuthorization("Manager");

        var supplierPayments = app.MapGroup("/api/v1/supplier-payments").WithTags("Supplier Payments");
        supplierPayments.MapGet("", async (PurchasingService service, CancellationToken ct) =>
            Results.Ok(await service.ListSupplierPaymentsAsync(ct))).RequireAuthorization("Member");
        supplierPayments.MapPost("", async (SupplierPaymentInput input, PurchasingService service, CancellationToken ct) =>
            Results.Created("/api/v1/supplier-payments", await service.PaySupplierAsync(input, ct)))
            .RequireAuthorization("Manager");
    }
}
