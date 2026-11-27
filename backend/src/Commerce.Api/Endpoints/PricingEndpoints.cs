using Commerce.Infrastructure.Services;

namespace Commerce.Api.Endpoints;

public sealed record QuoteRequest(Guid VariantId, int Quantity = 1, string? CouponCode = null);

public static class PricingEndpoints
{
    public static void MapPricingEndpoints(this IEndpointRouteBuilder app)
    {
        var pricing = app.MapGroup("/api/v1/pricing").WithTags("Pricing & Offers");

        pricing.MapGet("/offers", async (PricingService service, CancellationToken ct) =>
        {
            var lists = await service.ListAsync(ct);
            return Results.Ok(new { active = lists.Active, all = lists.All, coupons = lists.Coupons });
        }).RequireAuthorization("Member");

        pricing.MapPost("/offers", async (OfferInput input, PricingService service, CancellationToken ct) =>
            Results.Created("/api/v1/pricing/offers", await service.CreateOfferAsync(input, ct)))
            .RequireAuthorization("Manager");

        pricing.MapPut("/offers/{id:guid}", async (Guid id, OfferInput input, PricingService service, CancellationToken ct) =>
            Results.Ok(await service.UpdateOfferAsync(id, input, ct))).RequireAuthorization("Manager");

        pricing.MapDelete("/offers/{id:guid}", async (Guid id, PricingService service, CancellationToken ct) =>
        {
            await service.DeleteOfferAsync(id, ct);
            return Results.NoContent();
        }).RequireAuthorization("Manager");

        pricing.MapPost("/coupons", async (CouponInput input, PricingService service, CancellationToken ct) =>
            Results.Created("/api/v1/pricing/coupons", await service.CreateCouponAsync(input, ct)))
            .RequireAuthorization("Manager");

        pricing.MapPut("/coupons/{id:guid}", async (Guid id, CouponInput input, PricingService service, CancellationToken ct) =>
            Results.Ok(await service.UpdateCouponAsync(id, input, ct))).RequireAuthorization("Manager");

        pricing.MapDelete("/coupons/{id:guid}", async (Guid id, PricingService service, CancellationToken ct) =>
        {
            await service.DeleteCouponAsync(id, ct);
            return Results.NoContent();
        }).RequireAuthorization("Manager");

        pricing.MapPost("/quote", async (QuoteRequest request, PricingService service, CancellationToken ct) =>
        {
            var quantity = Math.Max(1, request.Quantity);
            var quote = await service.GetEffectivePriceAsync(request.VariantId, quantity, null, ct);
            var coupon = request.CouponCode is null
                ? null
                : await service.ValidateCouponAsync(request.CouponCode, quote.ListPrice * quantity, ct);
            return Results.Ok(new { quote, coupon });
        }).RequireAuthorization("Member");
    }
}
