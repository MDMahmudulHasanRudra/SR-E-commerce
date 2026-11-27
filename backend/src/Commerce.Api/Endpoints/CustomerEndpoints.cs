using Commerce.Infrastructure.Services;

namespace Commerce.Api.Endpoints;

public sealed record LinkExternalRequest(string Source, string ExternalId);

public static class CustomerEndpoints
{
    public static void MapCustomerEndpoints(this IEndpointRouteBuilder app)
    {
        var customers = app.MapGroup("/api/v1/customers").WithTags("Customers");

        customers.MapGet("", async (string? search, string? tag, bool? isBusiness, int? page, int? pageSize,
            CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(search, tag, isBusiness, page ?? 1, pageSize ?? 20, ct)))
            .RequireAuthorization("Member");

        customers.MapGet("/duplicates", async (string? email, string? phone, CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.FindDuplicatesAsync(email, phone, ct))).RequireAuthorization("Member");

        customers.MapGet("/{id:guid}", async (Guid id, CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.GetAsync(id, ct))).RequireAuthorization("Member");

        customers.MapPost("", async (CustomerInput input, CustomerService service, CancellationToken ct) =>
        {
            var customer = await service.CreateAsync(input, ct);
            return Results.Created($"/api/v1/customers/{customer.Id}", customer);
        }).RequireAuthorization("Staff");

        customers.MapPut("/{id:guid}", async (Guid id, CustomerInput input, CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.UpdateAsync(id, input, ct))).RequireAuthorization("Staff");

        customers.MapDelete("/{id:guid}", async (Guid id, CustomerService service, CancellationToken ct) =>
        {
            await service.DeleteAsync(id, ct);
            return Results.NoContent();
        }).RequireAuthorization("Manager");

        customers.MapPost("/{id:guid}/addresses", async (Guid id, AddressInput input, CustomerService service, CancellationToken ct) =>
            Results.Created($"/api/v1/customers/{id}", await service.AddAddressAsync(id, input, ct)))
            .RequireAuthorization("Staff");

        customers.MapDelete("/{id:guid}/addresses/{addressId:guid}", async (Guid id, Guid addressId,
            CustomerService service, CancellationToken ct) =>
        {
            await service.DeleteAddressAsync(id, addressId, ct);
            return Results.NoContent();
        }).RequireAuthorization("Staff");

        customers.MapPost("/{id:guid}/link-external", async (Guid id, LinkExternalRequest request,
            CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.LinkExternalAsync(id, request.Source, request.ExternalId, ct)))
            .RequireAuthorization("Manager");

        customers.MapDelete("/{id:guid}/link-external", async (Guid id, CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.UnlinkExternalAsync(id, ct))).RequireAuthorization("Manager");
    }
}
