using Commerce.Infrastructure.Services;

namespace Commerce.Api.Endpoints;

public static class SettingsEndpoints
{
    public static void MapSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        var settings = app.MapGroup("/api/v1/settings").WithTags("Settings");

        settings.MapGet("/company", async (SettingsService service, CancellationToken ct) =>
            Results.Ok(await service.GetCompanyAsync(ct))).RequireAuthorization("Member");

        settings.MapPut("/company", async (UpdateCompanySettingsInput input, SettingsService service, CancellationToken ct) =>
            Results.Ok(await service.UpdateCompanyAsync(input, ct))).RequireAuthorization("Admin");

        settings.MapGet("/workspaces", async (SettingsService service, CancellationToken ct) =>
            Results.Ok(await service.ListWorkspacesAsync(ct))).RequireAuthorization("Member");

        settings.MapPost("/workspaces", async (CreateWorkspaceInput input, SettingsService service, CancellationToken ct) =>
            Results.Created("/api/v1/settings/workspaces", await service.CreateWorkspaceAsync(input, ct)))
            .RequireAuthorization("Admin");

        settings.MapGet("/team", async (SettingsService service, CancellationToken ct) =>
            Results.Ok(await service.ListTeamAsync(ct))).RequireAuthorization("Member");

        settings.MapPost("/team", async (CreateTeamMemberInput input, SettingsService service, CancellationToken ct) =>
            Results.Created("/api/v1/settings/team", await service.CreateTeamMemberAsync(input, ct)))
            .RequireAuthorization("Admin");

        settings.MapPut("/team/{userId:guid}", async (Guid userId, UpdateTeamMemberInput input,
            SettingsService service, CancellationToken ct) =>
            Results.Ok(await service.UpdateTeamMemberAsync(userId, input, ct))).RequireAuthorization("Admin");

        settings.MapGet("/tax-rates", async (SettingsService service, CancellationToken ct) =>
            Results.Ok(await service.ListTaxRatesAsync(ct))).RequireAuthorization("Member");

        settings.MapPost("/tax-rates", async (TaxRateInput input, SettingsService service, CancellationToken ct) =>
            Results.Created("/api/v1/settings/tax-rates", await service.CreateTaxRateAsync(input, ct)))
            .RequireAuthorization("Admin");

        settings.MapPut("/tax-rates/{id:guid}", async (Guid id, TaxRateInput input, SettingsService service,
            CancellationToken ct) => Results.Ok(await service.UpdateTaxRateAsync(id, input, ct)))
            .RequireAuthorization("Admin");

        settings.MapDelete("/tax-rates/{id:guid}", async (Guid id, SettingsService service, CancellationToken ct) =>
        {
            await service.DeleteTaxRateAsync(id, ct);
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        settings.MapGet("/audit", async (string? search, int? page, int? pageSize, SettingsService service,
            CancellationToken ct) => Results.Ok(await service.ListAuditLogsAsync(search, page ?? 1, pageSize ?? 25, ct)))
            .RequireAuthorization("Admin");
    }
}
