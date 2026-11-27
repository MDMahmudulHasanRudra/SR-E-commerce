using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Orders;
using Commerce.Domain.Payments;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Services;

public sealed record SalesPoint(string Date, decimal Revenue, int Orders);
public sealed record StatusCount(string Status, int Count);
public sealed record TopProductRow(Guid ProductId, string Name, string Sku, int UnitsSold, decimal Revenue, decimal Profit);
public sealed record RecentTransaction(string Type, string Reference, string Counterparty, decimal Amount,
    string Status, DateTime At);
public sealed record AlertItem(string Level, string Title, string? Detail, string? Action);
public sealed record DashboardData(decimal TotalSales, decimal Revenue, int Orders, int PendingOrders,
    int Products, int LowStockCount, int Customers, decimal AverageOrderValue, decimal RevenueLast30,
    decimal RevenuePrevious30, IReadOnlyList<SalesPoint> SalesTrend, IReadOnlyList<TopProductRow> TopProducts,
    IReadOnlyList<RecentTransaction> RecentTransactions, IReadOnlyList<AlertItem> Alerts, string CurrencyCode,
    DateTime GeneratedAtUtc);

public sealed record SalesReport(decimal GrossSales, decimal NetSales, decimal Discounts, decimal Tax,
    decimal Shipping, decimal Refunds, int OrderCount, decimal AverageOrderValue,
    IReadOnlyList<SalesPoint> Trend, IReadOnlyList<StatusCount> ByStatus,
    IReadOnlyList<StatusCount> ByPaymentStatus, DateTime From, DateTime To);

public sealed record StockReportRow(Guid VariantId, Guid ProductId, string ProductName, string Sku, int OnHand,
    int Reserved, int Available, int ReorderPoint, decimal CostPrice, decimal Price, decimal StockValue, bool LowStock);

public sealed record CustomerTrendPoint(string Period, int NewCustomers, int Orders, decimal Revenue);
public sealed record CustomerReport(int TotalCustomers, int NewCustomers, int RepeatCustomers,
    decimal AverageLifetimeValue, IReadOnlyList<CustomerTrendPoint> Trend, DateTime From, DateTime To);

public sealed class ReportingService
{
    private readonly CommerceDbContext _db;

    public ReportingService(CommerceDbContext db) => _db = db;

    public async Task<DashboardData> GetDashboardAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var today = DateTime.SpecifyKind(now.Date, DateTimeKind.Utc);
        var start30 = today.AddDays(-29);
        var startPrev30 = start30.AddDays(-30);

        var orders = await _db.Orders.AsNoTracking()
            .Where(o => o.Status != OrderStatus.Cancelled).ToListAsync(ct);
        var allOrders = await _db.Orders.AsNoTracking().ToListAsync(ct);
        var payments = await _db.Payments.AsNoTracking()
            .Where(p => p.Status == PaymentRecordStatus.Completed && p.Direction == PaymentDirection.Incoming)
            .ToListAsync(ct);
        var products = await _db.Products.AsNoTracking().CountAsync(p => !p.IsDeleted, ct);
        var customers = await _db.Customers.AsNoTracking().CountAsync(c => !c.IsDeleted, ct);
        var lowStock = await LowStockQueryAsync(ct);

        var revenue30 = payments.Where(p => p.PaidAtUtc >= start30).Sum(p => p.Amount);
        var revenuePrev = payments.Where(p => p.PaidAtUtc >= startPrev30 && p.PaidAtUtc < start30).Sum(p => p.Amount);
        var totalSales = orders.Sum(o => o.GrandTotal);
        var revenue = payments.Sum(p => p.Amount);
        var paidOrders = orders.Count;

        var trend = new List<SalesPoint>();
        var dailyOrders = orders.Where(o => o.PlacedAtUtc >= start30).ToList();
        for (var day = start30; day <= today; day = day.AddDays(1))
        {
            var dayPayments = payments.Where(p => p.PaidAtUtc.Date == day).Sum(p => p.Amount);
            var dayOrderCount = dailyOrders.Count(o => o.PlacedAtUtc.Date == day);
            var dayOrderRevenue = dailyOrders.Where(o => o.PlacedAtUtc.Date == day).Sum(o => o.GrandTotal);
            trend.Add(new SalesPoint(day.ToString("yyyy-MM-dd"), Money.Round(dayPayments > 0 ? dayPayments : dayOrderRevenue), dayOrderCount));
        }

        var top = await ProductPerformanceAsync(start30, now, 5, ct);
        var recentPayments = payments.OrderByDescending(p => p.PaidAtUtc).Take(6).Select(p => new RecentTransaction(
            "Payment", p.Reference ?? p.Id.ToString()[..8], "", p.Amount, p.Status.ToString(), p.PaidAtUtc)).ToList();
        var recentOrders = allOrders.OrderByDescending(o => o.PlacedAtUtc).Take(6).Select(o => new RecentTransaction(
            "Order", o.OrderNumber, o.CustomerName, o.GrandTotal, o.Status.ToString(), o.PlacedAtUtc)).ToList();
        var recent = recentOrders.Concat(recentPayments).OrderByDescending(r => r.At).Take(8).ToList();

        var alerts = new List<AlertItem>();
        if (lowStock.Count > 0)
            alerts.Add(new AlertItem("warning", $"{lowStock.Count} product(s) low on stock",
                string.Join(", ", lowStock.Take(3).Select(l => l.ProductName)), "/inventory"));
        var pending = allOrders.Count(o => o.Status == OrderStatus.Pending);
        if (pending > 0)
            alerts.Add(new AlertItem("info", $"{pending} order(s) awaiting confirmation", "Review and confirm pending orders.", "/orders?status=Pending"));
        var unpaid = allOrders.Count(o => o.PaymentStatus == OrderPaymentStatus.Unpaid
            && o.Status is not (OrderStatus.Cancelled or OrderStatus.Refunded));
        if (unpaid > 0)
            alerts.Add(new AlertItem("warning", $"{unpaid} unpaid order(s)", "Follow up on outstanding balances.", "/orders?paymentStatus=Unpaid"));
        var lateReturns = await _db.OrderReturns.AsNoTracking().CountAsync(r => r.Status == ReturnStatus.Requested, ct);
        if (lateReturns > 0)
            alerts.Add(new AlertItem("info", $"{lateReturns} return request(s) to review", null, "/orders"));

        var currency = await _db.Workspaces.AsNoTracking().Select(w => w.CurrencyCode).FirstOrDefaultAsync(ct) ?? "USD";
        return new DashboardData(Money.Round(totalSales), Money.Round(revenue), allOrders.Count, pending,
            products, lowStock.Count, customers,
            Money.Round(paidOrders == 0 ? 0 : totalSales / paidOrders), Money.Round(revenue30), Money.Round(revenuePrev),
            trend, top, recent, alerts, currency, now);
    }

    public async Task<SalesReport> GetSalesReportAsync(DateTime? from, DateTime? to, CancellationToken ct = default)
    {
        var (start, end) = Range(from, to);
        var orders = await _db.Orders.AsNoTracking()
            .Where(o => o.PlacedAtUtc >= start && o.PlacedAtUtc < end).ToListAsync(ct);
        var valid = orders.Where(o => o.Status != OrderStatus.Cancelled).ToList();
        var refunds = await _db.Refunds.AsNoTracking()
            .Where(r => r.ProcessedAtUtc >= start && r.ProcessedAtUtc < end).ToListAsync(ct);

        var gross = valid.Sum(o => o.Subtotal);
        var discounts = valid.Sum(o => o.DiscountTotal);
        var tax = valid.Sum(o => o.TaxTotal);
        var shipping = valid.Sum(o => o.ShippingTotal);
        var net = gross - discounts + tax + shipping;

        var trend = new List<SalesPoint>();
        for (var day = start.Date; day < end; day = day.AddDays(1))
        {
            var dayOrders = valid.Where(o => o.PlacedAtUtc.Date == day).ToList();
            trend.Add(new SalesPoint(day.ToString("yyyy-MM-dd"), Money.Round(dayOrders.Sum(o => o.GrandTotal)), dayOrders.Count));
        }

        var byStatus = allStatuses.Select(s => new StatusCount(s.ToString(), orders.Count(o => o.Status == s))).ToList();
        var byPayment = allPaymentStatuses.Select(s => new StatusCount(s.ToString(), orders.Count(o => o.PaymentStatus == s))).ToList();

        return new SalesReport(Money.Round(gross), Money.Round(net), Money.Round(discounts), Money.Round(tax),
            Money.Round(shipping), Money.Round(refunds.Sum(r => r.Amount)), valid.Count,
            Money.Round(valid.Count == 0 ? 0 : net / valid.Count), trend, byStatus, byPayment,
            start, end.AddDays(-1));
    }

    public async Task<IReadOnlyList<TopProductRow>> ProductPerformanceAsync(DateTime? from, DateTime? to, int take = 20,
        CancellationToken ct = default)
    {
        var (start, end) = Range(from, to);
        var rows = await (from item in _db.OrderItems.AsNoTracking()
                          join order in _db.Orders.AsNoTracking() on item.OrderId equals order.Id
                          where order.PlacedAtUtc >= start && order.PlacedAtUtc < end
                              && order.Status != OrderStatus.Cancelled
                          select new { item, order }).ToListAsync(ct);

        var products = await _db.Products.AsNoTracking().ToDictionaryAsync(p => p.Id, p => p.Name, ct);
        var variantToProduct = await _db.ProductVariants.AsNoTracking()
            .Select(v => new { v.Id, v.ProductId }).ToDictionaryAsync(v => v.Id, v => v.ProductId, ct);

        return rows.GroupBy(r => new
        {
            ProductId = r.item.VariantId is not null ? variantToProduct.GetValueOrDefault(r.item.VariantId.Value, Guid.Empty) : Guid.Empty,
            r.item.ProductName,
            r.item.Sku
        }).Select(g =>
        {
            var units = g.Sum(x => x.item.Quantity);
            var revenueExTax = g.Sum(x => x.item.LineTotal - x.item.TaxAmount);
            var cost = g.Sum(x => x.item.UnitCost * x.item.Quantity);
            return new TopProductRow(g.Key.ProductId,
                products.GetValueOrDefault(g.Key.ProductId) ?? g.Key.ProductName,
                g.Key.Sku, units, Money.Round(revenueExTax), Money.Round(revenueExTax - cost));
        }).OrderByDescending(r => r.Revenue).Take(Math.Clamp(take, 1, 100)).ToList();
    }

    public async Task<IReadOnlyList<StockReportRow>> GetStockReportAsync(bool lowStockOnly = false, CancellationToken ct = default)
    {
        var rows = from s in _db.StockItems.AsNoTracking()
                   join v in _db.ProductVariants.AsNoTracking() on s.VariantId equals v.Id
                   join p in _db.Products.AsNoTracking() on v.ProductId equals p.Id
                   where !p.IsDeleted
                   select new { s, v, p };

        var list = await rows.ToListAsync(ct);
        var grouped = list.GroupBy(x => new { VariantId = x.v.Id, ProductId = x.p.Id, x.p.Name, x.v.Sku, x.v.CostPrice, x.v.Price })
            .Select(g =>
            {
                var onHand = g.Sum(x => x.s.QuantityOnHand);
                var reserved = g.Sum(x => x.s.QuantityReserved);
                var reorder = g.Max(x => x.s.ReorderPoint);
                return new StockReportRow(g.Key.VariantId, g.Key.ProductId,
                    g.Key.Name, g.Key.Sku, onHand, reserved, onHand - reserved, reorder,
                    g.Key.CostPrice, g.Key.Price, Money.Round(g.Key.CostPrice * onHand),
                    reorder > 0 && onHand - reserved <= reorder);
            }).Where(r => !lowStockOnly || r.LowStock).OrderBy(r => r.ProductName).ToList();
        return grouped;
    }

    public async Task<CustomerReport> GetCustomerReportAsync(DateTime? from, DateTime? to, CancellationToken ct = default)
    {
        var (start, end) = Range(from, to);
        var customers = await _db.Customers.AsNoTracking().Where(c => !c.IsDeleted).ToListAsync(ct);
        var orders = await _db.Orders.AsNoTracking()
            .Where(o => o.Status != OrderStatus.Cancelled).ToListAsync(ct);

        var orderStats = orders.Where(o => o.CustomerId != null)
            .GroupBy(o => o.CustomerId!.Value)
            .Select(g => new { CustomerId = g.Key, Count = g.Count(), Total = g.Sum(o => o.GrandTotal) })
            .ToDictionary(g => g.CustomerId, g => (g.Count, g.Total));

        var newCustomers = customers.Count(c => c.CreatedAtUtc >= start && c.CreatedAtUtc < end);
        var repeat = orderStats.Count(s => s.Value.Count > 1);
        var lifetime = customers.Count == 0 ? 0 : orders.Sum(o => o.GrandTotal) / customers.Count;

        var trend = new List<CustomerTrendPoint>();
        for (var month = new DateTime(start.Year, start.Month, 1); month < end; month = month.AddMonths(1))
        {
            var next = month.AddMonths(1);
            trend.Add(new CustomerTrendPoint(month.ToString("yyyy-MM"),
                customers.Count(c => c.CreatedAtUtc >= month && c.CreatedAtUtc < next),
                orders.Count(o => o.PlacedAtUtc >= month && o.PlacedAtUtc < next),
                Money.Round(orders.Where(o => o.PlacedAtUtc >= month && o.PlacedAtUtc < next).Sum(o => o.GrandTotal))));
        }

        return new CustomerReport(customers.Count, newCustomers, repeat, Money.Round(lifetime), trend,
            start, end.AddDays(-1));
    }

    private async Task<List<StockReportRow>> LowStockQueryAsync(CancellationToken ct)
    {
        var report = await GetStockReportAsync(true, ct);
        return report.ToList();
    }

    private static (DateTime Start, DateTime End) Range(DateTime? from, DateTime? to)
    {
        var endDate = DateTime.SpecifyKind((to ?? DateTime.UtcNow).Date, DateTimeKind.Utc).AddDays(1);
        var startDate = DateTime.SpecifyKind((from ?? endDate.AddDays(-31)).Date, DateTimeKind.Utc);
        if (startDate >= endDate) throw new DomainException(DomainErrors.Validation, "The start date must be before the end date.");
        return (startDate, endDate);
    }

    private static readonly OrderStatus[] allStatuses = Enum.GetValues<OrderStatus>();
    private static readonly OrderPaymentStatus[] allPaymentStatuses = Enum.GetValues<OrderPaymentStatus>();
}
