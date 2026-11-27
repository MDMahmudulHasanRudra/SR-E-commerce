using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Infrastructure.Services;

namespace Commerce.Api.Endpoints;

public sealed record ChangeOrderStatusRequest(OrderStatus Status, string? Note);
public sealed record ProcessReturnRequest(bool Approve);

public static class OrderEndpoints
{
    public static void MapOrderEndpoints(this IEndpointRouteBuilder app)
    {
        var orders = app.MapGroup("/api/v1/orders").WithTags("Orders");

        orders.MapGet("", async (string? search, OrderStatus? status, OrderPaymentStatus? paymentStatus,
            Guid? customerId, DateTime? from, DateTime? to, int? page, int? pageSize,
            OrderService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(search, status, paymentStatus, customerId, from, to,
                page ?? 1, pageSize ?? 20, ct))).RequireAuthorization("Member");

        orders.MapGet("/{id:guid}", async (Guid id, OrderService service, CancellationToken ct) =>
            Results.Ok(await service.GetAsync(id, ct))).RequireAuthorization("Member");

        orders.MapPost("", async (CreateOrderInput input, OrderService service, CancellationToken ct) =>
        {
            var order = await service.CreateAsync(input, ct);
            return Results.Created($"/api/v1/orders/{order.Id}", order);
        }).RequireAuthorization("Staff");

        orders.MapPost("/{id:guid}/status", async (Guid id, ChangeOrderStatusRequest request,
            OrderService service, CancellationToken ct) =>
        {
            if (!Enum.IsDefined(request.Status))
                throw new DomainException(DomainErrors.Validation, "Unknown order status.");
            return Results.Ok(await service.ChangeStatusAsync(id, request.Status, request.Note, ct));
        }).RequireAuthorization("Staff");

        orders.MapGet("/{id:guid}/invoice", async (Guid id, OrderService service, CancellationToken ct) =>
            Results.Ok(await service.GetInvoiceAsync(id, ct))).RequireAuthorization("Member");

        orders.MapPost("/{id:guid}/returns", async (Guid id, ReturnInput input, OrderService service, CancellationToken ct) =>
            Results.Created($"/api/v1/orders/{id}", await service.CreateReturnAsync(id, input, ct)))
            .RequireAuthorization("Staff");

        orders.MapPost("/{id:guid}/returns/{returnId:guid}/process", async (Guid id, Guid returnId,
            ProcessReturnRequest request, OrderService service, CancellationToken ct) =>
            Results.Ok(await service.ProcessReturnAsync(id, returnId, request.Approve, ct)))
            .RequireAuthorization("Manager");
    }
}
