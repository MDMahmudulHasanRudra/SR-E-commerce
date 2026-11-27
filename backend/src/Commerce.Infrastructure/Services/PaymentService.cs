using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Orders;
using Commerce.Domain.Payments;
using Commerce.Domain.Purchasing;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Services;

public sealed record RecordPaymentInput(Guid? OrderId, decimal Amount, string Method, string? Reference,
    string? Notes, DateTime? PaidAtUtc, Guid? CustomerId = null);
public sealed record PaymentView(Guid Id, Guid? OrderId, string? OrderNumber, Guid? CustomerId, string? CustomerName,
    PaymentDirection Direction, string Method, decimal Amount, string CurrencyCode, string Status,
    string? Reference, string? Notes, DateTime PaidAtUtc);
public sealed record RefundInput(Guid OrderId, decimal Amount, string Reason);
public sealed record RefundView(Guid Id, Guid OrderId, string OrderNumber, decimal Amount, string Reason,
    string Status, DateTime ProcessedAtUtc);
public sealed record ExpenseInput(string Category, string Description, decimal Amount, DateTime PaidAtUtc,
    string Method, string? Reference);
public sealed record ExpenseView(Guid Id, string Category, string Description, decimal Amount, DateTime PaidAtUtc,
    string Method, string? Reference);
public sealed record MethodTotal(string Method, decimal Amount);
public sealed record DailyFinancePoint(string Date, decimal Revenue, decimal Expenses);
public sealed record FinanceSummary(decimal Revenue, decimal Refunds, decimal Expenses, decimal NetRevenue,
    decimal Receivables, decimal Payables, decimal CashCollected, IReadOnlyList<MethodTotal> ByMethod,
    IReadOnlyList<DailyFinancePoint> Daily);

public sealed class PaymentService
{
    private readonly CommerceDbContext _db;
    private readonly AuditService _audit;
    private readonly OutboxService _outbox;

    public PaymentService(CommerceDbContext db, AuditService audit, OutboxService outbox)
    {
        _db = db;
        _audit = audit;
        _outbox = outbox;
    }

    public async Task<PagedResult<PaymentView>> ListPaymentsAsync(string? search, string? method,
        DateTime? from, DateTime? to, int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = _db.Payments.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(method)) query = query.Where(p => p.Method == method);
        if (from is not null) query = query.Where(p => p.PaidAtUtc >= from);
        if (to is not null) query = query.Where(p => p.PaidAtUtc < to.Value.AddDays(1));

        var total = await query.CountAsync(ct);
        var payments = await query.OrderByDescending(p => p.PaidAtUtc)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        var orderIds = payments.Where(p => p.OrderId != null).Select(p => p.OrderId!.Value).Distinct().ToList();
        var customerIds = payments.Where(p => p.CustomerId != null).Select(p => p.CustomerId!.Value).Distinct().ToList();
        var orders = await _db.Orders.AsNoTracking().Where(o => orderIds.Contains(o.Id))
            .Select(o => new { o.Id, o.OrderNumber, o.CustomerName }).ToDictionaryAsync(o => o.Id, ct);
        var customerNames = await _db.Customers.AsNoTracking().Where(c => customerIds.Contains(c.Id))
            .Select(c => new { c.Id, c.FirstName, c.LastName, c.CompanyName }).ToListAsync(ct);

        var items = payments.Select(p =>
        {
            var order = p.OrderId is not null ? orders.GetValueOrDefault(p.OrderId.Value) : null;
            var customer = p.CustomerId is not null
                ? customerNames.FirstOrDefault(c => c.Id == p.CustomerId.Value)
                : null;
            var customerName = customer is null
                ? order?.CustomerName
                : string.IsNullOrWhiteSpace(customer.CompanyName)
                    ? $"{customer.FirstName} {customer.LastName}".Trim()
                    : customer.CompanyName;
            return new PaymentView(p.Id, p.OrderId, order?.OrderNumber, p.CustomerId, customerName,
                p.Direction, p.Method, p.Amount, p.CurrencyCode, p.Status.ToString(), p.Reference, p.Notes, p.PaidAtUtc);
        }).ToList();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            items = items.Where(p => (p.OrderNumber ?? "").ToLower().Contains(term)
                || (p.CustomerName ?? "").ToLower().Contains(term)
                || (p.Reference ?? "").ToLower().Contains(term)).ToList();
        }

        return new PagedResult<PaymentView>(items, page, pageSize, total);
    }

    public async Task<PaymentView> RecordPaymentAsync(RecordPaymentInput input, CancellationToken ct = default)
    {
        if (input.Amount <= 0)
            throw new DomainException(DomainErrors.Validation, "Payment amount must be greater than zero.");
        if (string.IsNullOrWhiteSpace(input.Method))
            throw new DomainException(DomainErrors.Validation, "Payment method is required.");

        Order? order = null;
        if (input.OrderId is not null)
        {
            order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == input.OrderId, ct)
                ?? throw new DomainException(DomainErrors.NotFound, "Order not found.");
            if (order.Status is OrderStatus.Cancelled or OrderStatus.Refunded)
                throw new DomainException(DomainErrors.InvalidState, "This order can no longer accept payments.");
            var outstanding = order.GrandTotal - order.PaidTotal - order.RefundedTotal;
            if (input.Amount > outstanding + 0.01m)
                throw new DomainException(DomainErrors.Validation,
                    $"Payment exceeds the outstanding balance of {outstanding:0.00} {order.CurrencyCode}.");
        }

        var payment = new Payment
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            OrderId = order?.Id,
            CustomerId = input.CustomerId ?? order?.CustomerId,
            Direction = PaymentDirection.Incoming,
            Method = input.Method.Trim().ToLowerInvariant(),
            Amount = Money.Round(input.Amount),
            CurrencyCode = order?.CurrencyCode ?? await CurrencyAsync(ct),
            Status = PaymentRecordStatus.Completed,
            Reference = input.Reference?.Trim(),
            Notes = input.Notes?.Trim(),
            PaidAtUtc = input.PaidAtUtc ?? DateTime.UtcNow
        };
        _db.Payments.Add(payment);

        if (order is not null)
        {
            await RecalculateOrderPaymentAsync(order, payment, ct);
            _db.OrderEvents.Add(new OrderEvent
            {
                TenantId = _db.CurrentTenantId,
                WorkspaceId = _db.CurrentWorkspaceId,
                OrderId = order.Id,
                Type = "payment",
                Message = $"Payment of {payment.Amount:0.00} {payment.CurrencyCode} recorded",
                UserId = _db.CurrentTenantId == Guid.Empty ? null : null
            });
        }

        _audit.Record("payment.recorded", "Payment", payment.Id.ToString(),
            $"{payment.Amount:0.00} {payment.CurrencyCode} via {payment.Method}");
        _outbox.Enqueue("commerce.payment.recorded", payment.Id.ToString(), new
        {
            paymentId = payment.Id,
            orderId = payment.OrderId,
            orderNumber = order?.OrderNumber,
            amount = payment.Amount,
            currency = payment.CurrencyCode,
            method = payment.Method,
            status = "COMPLETED"
        });

        await _db.SaveChangesAsync(ct);
        return new PaymentView(payment.Id, order?.Id, order?.OrderNumber, payment.CustomerId, order?.CustomerName,
            payment.Direction, payment.Method, payment.Amount, payment.CurrencyCode, payment.Status.ToString(),
            payment.Reference, payment.Notes, payment.PaidAtUtc);
    }

    public async Task<IReadOnlyList<RefundView>> ListRefundsAsync(CancellationToken ct = default)
    {
        var refunds = await _db.Refunds.AsNoTracking().OrderByDescending(r => r.ProcessedAtUtc).Take(200).ToListAsync(ct);
        var orderIds = refunds.Select(r => r.OrderId).Distinct().ToList();
        var orders = await _db.Orders.AsNoTracking().Where(o => orderIds.Contains(o.Id))
            .ToDictionaryAsync(o => o.Id, o => o.OrderNumber, ct);
        return refunds.Select(r => new RefundView(r.Id, r.OrderId, orders.GetValueOrDefault(r.OrderId, ""),
            r.Amount, r.Reason, r.Status, r.ProcessedAtUtc)).ToList();
    }

    public async Task<RefundView> RefundAsync(RefundInput input, CancellationToken ct = default)
    {
        var order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == input.OrderId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Order not found.");
        if (input.Amount <= 0)
            throw new DomainException(DomainErrors.Validation, "Refund amount must be greater than zero.");
        var refundable = order.PaidTotal - order.RefundedTotal;
        if (input.Amount > refundable + 0.01m)
            throw new DomainException(DomainErrors.Validation,
                $"Refund exceeds the refundable balance of {refundable:0.00} {order.CurrencyCode}.");

        var refund = new Refund
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            OrderId = order.Id,
            Amount = Money.Round(input.Amount),
            Reason = input.Reason?.Trim() ?? string.Empty,
            Status = "completed",
            ProcessedAtUtc = DateTime.UtcNow
        };
        _db.Refunds.Add(refund);

        order.RefundedTotal = Money.Round(order.RefundedTotal + refund.Amount);
        order.PaymentStatus = order.RefundedTotal >= order.PaidTotal
            ? OrderPaymentStatus.Refunded
            : OrderPaymentStatus.Partial;
        if (order.RefundedTotal >= order.GrandTotal)
            order.Status = OrderStatus.Refunded;

        _db.OrderEvents.Add(new OrderEvent
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            OrderId = order.Id,
            Type = "refunded",
            Message = $"Refund of {refund.Amount:0.00} {order.CurrencyCode} processed"
        });

        _audit.Record("refund.completed", "Order", order.Id.ToString(), $"{refund.Amount:0.00}");
        _outbox.Enqueue("commerce.refund.completed", order.Id.ToString(), new
        {
            refundId = refund.Id, orderId = order.Id, orderNumber = order.OrderNumber,
            amount = refund.Amount, currency = order.CurrencyCode
        });

        await _db.SaveChangesAsync(ct);
        return new RefundView(refund.Id, order.Id, order.OrderNumber, refund.Amount, refund.Reason,
            refund.Status, refund.ProcessedAtUtc);
    }

    public async Task<IReadOnlyList<ExpenseView>> ListExpensesAsync(CancellationToken ct = default)
    {
        var expenses = await _db.Expenses.AsNoTracking().OrderByDescending(e => e.PaidAtUtc).Take(300).ToListAsync(ct);
        return expenses.Select(e => new ExpenseView(e.Id, e.Category, e.Description, e.Amount, e.PaidAtUtc,
            e.Method, e.Reference)).ToList();
    }

    public async Task<ExpenseView> CreateExpenseAsync(ExpenseInput input, CancellationToken ct = default)
    {
        if (input.Amount <= 0)
            throw new DomainException(DomainErrors.Validation, "Expense amount must be greater than zero.");
        if (string.IsNullOrWhiteSpace(input.Description))
            throw new DomainException(DomainErrors.Validation, "Expense description is required.");

        var expense = new Expense
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            Category = string.IsNullOrWhiteSpace(input.Category) ? "general" : input.Category.Trim().ToLowerInvariant(),
            Description = input.Description.Trim(),
            Amount = Money.Round(input.Amount),
            PaidAtUtc = input.PaidAtUtc == default ? DateTime.UtcNow : input.PaidAtUtc,
            Method = string.IsNullOrWhiteSpace(input.Method) ? "cash" : input.Method.Trim().ToLowerInvariant(),
            Reference = input.Reference?.Trim()
        };
        _db.Expenses.Add(expense);
        _audit.Record("expense.created", "Expense", expense.Id.ToString(), expense.Description);
        await _db.SaveChangesAsync(ct);
        return new ExpenseView(expense.Id, expense.Category, expense.Description, expense.Amount,
            expense.PaidAtUtc, expense.Method, expense.Reference);
    }

    public async Task DeleteExpenseAsync(Guid id, CancellationToken ct = default)
    {
        var expense = await _db.Expenses.FirstOrDefaultAsync(e => e.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Expense not found.");
        _db.Expenses.Remove(expense);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<FinanceSummary> SummaryAsync(DateTime? from, DateTime? to, CancellationToken ct = default)
    {
        var toDate = DateTime.SpecifyKind((to ?? DateTime.UtcNow).Date, DateTimeKind.Utc);
        var fromDate = DateTime.SpecifyKind((from ?? toDate.AddDays(-29)).Date, DateTimeKind.Utc);
        var start = fromDate;
        var end = toDate.AddDays(1);

        var payments = await _db.Payments.AsNoTracking()
            .Where(p => p.Direction == PaymentDirection.Incoming && p.Status == PaymentRecordStatus.Completed
                && p.PaidAtUtc >= start && p.PaidAtUtc < end).ToListAsync(ct);
        var refunds = await _db.Refunds.AsNoTracking()
            .Where(r => r.ProcessedAtUtc >= start && r.ProcessedAtUtc < end).ToListAsync(ct);
        var expenses = await _db.Expenses.AsNoTracking()
            .Where(e => e.PaidAtUtc >= start && e.PaidAtUtc < end).ToListAsync(ct);

        var revenue = payments.Sum(p => p.Amount);
        var refundTotal = refunds.Sum(r => r.Amount);
        var expenseTotal = expenses.Sum(e => e.Amount);

        var receivables = await _db.Orders.AsNoTracking()
            .Where(o => o.Status != OrderStatus.Cancelled && o.Status != OrderStatus.Refunded)
            .SumAsync(o => o.GrandTotal - o.PaidTotal - o.RefundedTotal, ct);
        var payables = await _db.PurchaseOrders.AsNoTracking()
            .Where(p => p.Status == PurchaseOrderStatus.Ordered || p.Status == PurchaseOrderStatus.PartiallyReceived)
            .SumAsync(p => p.Total - p.AmountPaid, ct);

        var byMethod = payments.GroupBy(p => p.Method)
            .Select(g => new MethodTotal(g.Key, g.Sum(p => p.Amount))).OrderByDescending(m => m.Amount).ToList();

        var daily = new List<DailyFinancePoint>();
        for (var day = start; day < end; day = day.AddDays(1))
        {
            daily.Add(new DailyFinancePoint(day.ToString("yyyy-MM-dd"),
                Money.Round(payments.Where(p => p.PaidAtUtc.Date == day).Sum(p => p.Amount)),
                Money.Round(expenses.Where(e => e.PaidAtUtc.Date == day).Sum(e => e.Amount))));
        }

        return new FinanceSummary(Money.Round(revenue), Money.Round(refundTotal), Money.Round(expenseTotal),
            Money.Round(revenue - refundTotal - expenseTotal), Money.Round(Math.Max(0, receivables)),
            Money.Round(Math.Max(0, payables)), Money.Round(payments.Where(p => p.Method is "cash" or "card" or "bank" or "mobile").Sum(p => p.Amount)),
            byMethod, daily);
    }

    private async Task RecalculateOrderPaymentAsync(Order order, Payment payment, CancellationToken ct)
    {
        var paid = await _db.Payments
            .Where(p => p.OrderId == order.Id && p.Status == PaymentRecordStatus.Completed
                && p.Direction == PaymentDirection.Incoming)
            .SumAsync(p => p.Amount, ct);
        if (!await _db.Payments.AnyAsync(p => p.Id == payment.Id, ct))
            paid += payment.Amount;
        order.PaidTotal = Money.Round(paid);
        order.PaymentStatus = order.PaidTotal <= 0
            ? OrderPaymentStatus.Unpaid
            : order.PaidTotal + 0.01m >= order.GrandTotal
                ? OrderPaymentStatus.Paid
                : OrderPaymentStatus.Partial;
    }

    private async Task<string> CurrencyAsync(CancellationToken ct) =>
        (await _db.Workspaces.AsNoTracking().FirstAsync(w => w.Id == _db.CurrentWorkspaceId, ct)).CurrencyCode;
}
