using Commerce.Infrastructure.Services;

namespace Commerce.Api.Endpoints;

public static class FinanceEndpoints
{
    public static void MapFinanceEndpoints(this IEndpointRouteBuilder app)
    {
        var payments = app.MapGroup("/api/v1/payments").WithTags("Payments");
        payments.MapGet("", async (string? search, string? method, DateTime? from, DateTime? to,
            int? page, int? pageSize, PaymentService service, CancellationToken ct) =>
            Results.Ok(await service.ListPaymentsAsync(search, method, from, to, page ?? 1, pageSize ?? 20, ct)))
            .RequireAuthorization("Member");
        payments.MapPost("", async (RecordPaymentInput input, PaymentService service, CancellationToken ct) =>
            Results.Created("/api/v1/payments", await service.RecordPaymentAsync(input, ct)))
            .RequireAuthorization("Staff");

        var refunds = app.MapGroup("/api/v1/refunds").WithTags("Refunds");
        refunds.MapGet("", async (PaymentService service, CancellationToken ct) =>
            Results.Ok(await service.ListRefundsAsync(ct))).RequireAuthorization("Member");
        refunds.MapPost("", async (RefundInput input, PaymentService service, CancellationToken ct) =>
            Results.Created("/api/v1/refunds", await service.RefundAsync(input, ct))).RequireAuthorization("Manager");

        var expenses = app.MapGroup("/api/v1/expenses").WithTags("Expenses");
        expenses.MapGet("", async (PaymentService service, CancellationToken ct) =>
            Results.Ok(await service.ListExpensesAsync(ct))).RequireAuthorization("Member");
        expenses.MapPost("", async (ExpenseInput input, PaymentService service, CancellationToken ct) =>
            Results.Created("/api/v1/expenses", await service.CreateExpenseAsync(input, ct)))
            .RequireAuthorization("Manager");
        expenses.MapDelete("/{id:guid}", async (Guid id, PaymentService service, CancellationToken ct) =>
        {
            await service.DeleteExpenseAsync(id, ct);
            return Results.NoContent();
        }).RequireAuthorization("Manager");

        app.MapGet("/api/v1/finance/summary", async (DateTime? from, DateTime? to, PaymentService service,
            CancellationToken ct) => Results.Ok(await service.SummaryAsync(from, to, ct)))
            .WithTags("Finance").RequireAuthorization("Member");
    }
}
