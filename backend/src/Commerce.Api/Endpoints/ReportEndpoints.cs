using System.Text;
using Commerce.Infrastructure.Services;

namespace Commerce.Api.Endpoints;

public static class ReportEndpoints
{
    public static void MapReportEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/dashboard", async (ReportingService reports, CancellationToken ct) =>
            Results.Ok(await reports.GetDashboardAsync(ct)))
            .WithTags("Dashboard").RequireAuthorization("Member");

        var reports = app.MapGroup("/api/v1/reports").WithTags("Reports");

        reports.MapGet("/sales", async (DateTime? from, DateTime? to, ReportingService service, CancellationToken ct) =>
            Results.Ok(await service.GetSalesReportAsync(from, to, ct))).RequireAuthorization("Member");

        reports.MapGet("/products", async (DateTime? from, DateTime? to, int? take, ReportingService service, CancellationToken ct) =>
            Results.Ok(await service.ProductPerformanceAsync(from, to, take ?? 20, ct))).RequireAuthorization("Member");

        reports.MapGet("/stock", async (bool? lowStock, ReportingService service, CancellationToken ct) =>
            Results.Ok(await service.GetStockReportAsync(lowStock ?? false, ct))).RequireAuthorization("Member");

        reports.MapGet("/customers", async (DateTime? from, DateTime? to, ReportingService service, CancellationToken ct) =>
            Results.Ok(await service.GetCustomerReportAsync(from, to, ct))).RequireAuthorization("Member");

        reports.MapGet("/export", async (string? type, DateTime? from, DateTime? to,
            ReportingService service, CancellationToken ct) =>
        {
            var kind = (type ?? "sales").Trim().ToLowerInvariant();
            var sb = new StringBuilder();
            string filename;
            switch (kind)
            {
                case "sales":
                {
                    var report = await service.GetSalesReportAsync(from, to, ct);
                    sb.AppendLine("Date,Revenue,Orders");
                    foreach (var point in report.Trend) sb.AppendLine($"{point.Date},{point.Revenue:0.00},{point.Orders}");
                    filename = "sales-report.csv";
                    break;
                }
                case "products":
                {
                    var rows = await service.ProductPerformanceAsync(from, to, 500, ct);
                    sb.AppendLine("Product,Sku,UnitsSold,Revenue,Profit");
                    foreach (var row in rows)
                        sb.AppendLine($"{Csv(row.Name)},{Csv(row.Sku)},{row.UnitsSold},{row.Revenue:0.00},{row.Profit:0.00}");
                    filename = "product-performance.csv";
                    break;
                }
                case "stock":
                {
                    var rows = await service.GetStockReportAsync(false, ct);
                    sb.AppendLine("Product,Sku,OnHand,Reserved,Available,ReorderPoint,StockValue,LowStock");
                    foreach (var row in rows)
                        sb.AppendLine($"{Csv(row.ProductName)},{Csv(row.Sku)},{row.OnHand},{row.Reserved},{row.Available},{row.ReorderPoint},{row.StockValue:0.00},{row.LowStock}");
                    filename = "stock-report.csv";
                    break;
                }
                case "customers":
                {
                    var report = await service.GetCustomerReportAsync(from, to, ct);
                    sb.AppendLine("Period,NewCustomers,Orders,Revenue");
                    foreach (var point in report.Trend)
                        sb.AppendLine($"{point.Period},{point.NewCustomers},{point.Orders},{point.Revenue:0.00}");
                    filename = "customer-report.csv";
                    break;
                }
                default:
                    return Results.BadRequest(new { error = new { code = "VALIDATION_ERROR", message = "Unknown report type. Use sales, products, stock or customers." } });
            }

            return Results.File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv; charset=utf-8", filename);
        }).RequireAuthorization("Member");
    }

    private static string Csv(string value) =>
        value.Contains(',') || value.Contains('"')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
}
