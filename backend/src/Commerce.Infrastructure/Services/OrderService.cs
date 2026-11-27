using System.Text.Json;
using Commerce.Domain;
using Commerce.Domain.Common;
using Commerce.Domain.Customers;
using Commerce.Domain.Inventory;
using Commerce.Domain.Orders;
using Commerce.Domain.Payments;
using Commerce.Infrastructure.Abstractions;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Services;

public sealed record OrderLineInput(Guid VariantId, int Quantity);
public sealed record CreateOrderInput(Guid? CustomerId, string? CustomerName, string? CustomerEmail,
    string? CustomerPhone, IReadOnlyList<OrderLineInput> Items, string? CouponCode, decimal ShippingTotal,
    string? Notes, string? ShippingAddressJson, string? Source = "standalone", string? ExternalOrderId = null);
public sealed record ReturnInput(string Reason, decimal RefundAmount, string? ItemsJson = null);

public sealed record OrderItemView(Guid Id, Guid? VariantId, string ProductName, string Sku, int Quantity,
    decimal UnitPrice, decimal UnitCost, decimal DiscountAmount, decimal TaxAmount, decimal LineTotal);
public sealed record OrderEventView(Guid Id, string Type, string? Message, DateTime CreatedAtUtc);
public sealed record OrderPaymentView(Guid Id, decimal Amount, string Method, string Status, DateTime PaidAtUtc,
    string? Reference);
public sealed record OrderRefundView(Guid Id, decimal Amount, string Reason, string Status, DateTime ProcessedAtUtc);
public sealed record OrderReturnView(Guid Id, string Reason, ReturnStatus Status, decimal RefundAmount,
    DateTime CreatedAtUtc, DateTime? ProcessedAtUtc);
public sealed record InvoiceView(Guid Id, string InvoiceNumber, DateTime IssuedAtUtc, DateTime DueAtUtc,
    decimal Amount, string Status);

public sealed record OrderListItem(Guid Id, string OrderNumber, string CustomerName, string? CustomerEmail,
    OrderStatus Status, OrderPaymentStatus PaymentStatus, FulfillmentStatus FulfillmentStatus,
    decimal GrandTotal, string CurrencyCode, int ItemCount, DateTime PlacedAtUtc);

public sealed record OrderView(Guid Id, string OrderNumber, Guid? CustomerId, string CustomerName,
    string? CustomerEmail, string? CustomerPhone, OrderStatus Status, OrderPaymentStatus PaymentStatus,
    FulfillmentStatus FulfillmentStatus, decimal Subtotal, decimal DiscountTotal, decimal TaxTotal,
    decimal ShippingTotal, decimal GrandTotal, decimal PaidTotal, decimal RefundedTotal, string CurrencyCode,
    string? CouponCode, string? ShippingAddressJson, string? Notes, string? Source, string? ExternalOrderId,
    DateTime PlacedAtUtc, DateTime? ConfirmedAtUtc, DateTime? ShippedAtUtc, DateTime? DeliveredAtUtc,
    DateTime? CancelledAtUtc, IReadOnlyList<OrderItemView> Items, IReadOnlyList<OrderEventView> Events,
    IReadOnlyList<OrderPaymentView> Payments, IReadOnlyList<OrderRefundView> Refunds,
    IReadOnlyList<OrderReturnView> Returns, InvoiceView? Invoice);

public sealed class OrderService
{
    private readonly CommerceDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly PricingService _pricing;
    private readonly InventoryService _inventory;
    private readonly AuditService _audit;
    private readonly OutboxService _outbox;

    public OrderService(CommerceDbContext db, ITenantContext tenant, PricingService pricing,
        InventoryService inventory, AuditService audit, OutboxService outbox)
    {
        _db = db;
        _tenant = tenant;
        _pricing = pricing;
        _inventory = inventory;
        _audit = audit;
        _outbox = outbox;
    }

    public async Task<PagedResult<OrderListItem>> ListAsync(string? search, OrderStatus? status,
        OrderPaymentStatus? paymentStatus, Guid? customerId, DateTime? from, DateTime? to, int page, int pageSize,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = _db.Orders.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(o => o.OrderNumber.ToLower().Contains(term)
                || o.CustomerName.ToLower().Contains(term)
                || (o.CustomerEmail != null && o.CustomerEmail.ToLower().Contains(term)));
        }
        if (status is not null) query = query.Where(o => o.Status == status);
        if (paymentStatus is not null) query = query.Where(o => o.PaymentStatus == paymentStatus);
        if (customerId is not null) query = query.Where(o => o.CustomerId == customerId);
        if (from is not null) query = query.Where(o => o.PlacedAtUtc >= from);
        if (to is not null) query = query.Where(o => o.PlacedAtUtc < to.Value.AddDays(1));

        var total = await query.CountAsync(ct);
        var orders = await query.OrderByDescending(o => o.PlacedAtUtc)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var orderIds = orders.Select(o => o.Id).ToList();
        var counts = await _db.OrderItems.AsNoTracking().Where(i => orderIds.Contains(i.OrderId))
            .GroupBy(i => i.OrderId).Select(g => new { OrderId = g.Key, Count = g.Sum(i => i.Quantity) })
            .ToDictionaryAsync(x => x.OrderId, x => x.Count, ct);

        var items = orders.Select(o => new OrderListItem(o.Id, o.OrderNumber, o.CustomerName, o.CustomerEmail,
            o.Status, o.PaymentStatus, o.FulfillmentStatus, o.GrandTotal, o.CurrencyCode,
            counts.GetValueOrDefault(o.Id), o.PlacedAtUtc)).ToList();

        return new PagedResult<OrderListItem>(items, page, pageSize, total);
    }

    public async Task<OrderView> GetAsync(Guid id, CancellationToken ct = default)
    {
        var o = await _db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Order not found.");
        var items = await _db.OrderItems.AsNoTracking().Where(i => i.OrderId == id).OrderBy(i => i.CreatedAtUtc).ToListAsync(ct);
        var events = await _db.OrderEvents.AsNoTracking().Where(e => e.OrderId == id).OrderBy(e => e.CreatedAtUtc).ToListAsync(ct);
        var payments = await _db.Payments.AsNoTracking().Where(p => p.OrderId == id).OrderByDescending(p => p.PaidAtUtc).ToListAsync(ct);
        var refunds = await _db.Refunds.AsNoTracking().Where(r => r.OrderId == id).OrderByDescending(r => r.ProcessedAtUtc).ToListAsync(ct);
        var returns = await _db.OrderReturns.AsNoTracking().Where(r => r.OrderId == id).OrderByDescending(r => r.CreatedAtUtc).ToListAsync(ct);
        var invoice = await _db.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.OrderId == id, ct);

        return new OrderView(o.Id, o.OrderNumber, o.CustomerId, o.CustomerName, o.CustomerEmail, o.CustomerPhone,
            o.Status, o.PaymentStatus, o.FulfillmentStatus, o.Subtotal, o.DiscountTotal, o.TaxTotal,
            o.ShippingTotal, o.GrandTotal, o.PaidTotal, o.RefundedTotal, o.CurrencyCode, o.CouponCode,
            o.ShippingAddressJson, o.Notes, o.Source, o.ExternalOrderId, o.PlacedAtUtc, o.ConfirmedAtUtc,
            o.ShippedAtUtc, o.DeliveredAtUtc, o.CancelledAtUtc,
            items.Select(i => new OrderItemView(i.Id, i.VariantId, i.ProductName, i.Sku, i.Quantity, i.UnitPrice,
                i.UnitCost, i.DiscountAmount, i.TaxAmount, i.LineTotal)).ToList(),
            events.Select(e => new OrderEventView(e.Id, e.Type, e.Message, e.CreatedAtUtc)).ToList(),
            payments.Select(p => new OrderPaymentView(p.Id, p.Amount, p.Method, p.Status.ToString(), p.PaidAtUtc, p.Reference)).ToList(),
            refunds.Select(r => new OrderRefundView(r.Id, r.Amount, r.Reason, r.Status, r.ProcessedAtUtc)).ToList(),
            returns.Select(r => new OrderReturnView(r.Id, r.Reason, r.Status, r.RefundAmount, r.CreatedAtUtc, r.ProcessedAtUtc)).ToList(),
            invoice is null ? null : new InvoiceView(invoice.Id, invoice.InvoiceNumber, invoice.IssuedAtUtc, invoice.DueAtUtc, invoice.Amount, invoice.Status));
    }

    public async Task<OrderView> CreateAsync(CreateOrderInput input, CancellationToken ct = default)
    {
        if (input.Items is null || input.Items.Count == 0)
            throw new DomainException(DomainErrors.Validation, "An order must contain at least one item.");
        if (input.ShippingTotal < 0)
            throw new DomainException(DomainErrors.Validation, "Shipping total cannot be negative.");

        var warehouse = await _inventory.GetDefaultWarehouseAsync(ct);

        Customer? customer = null;
        if (input.CustomerId is not null)
        {
            customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == input.CustomerId && !c.IsDeleted, ct)
                ?? throw new DomainException(DomainErrors.NotFound, "Customer not found.");
        }

        var customerName = input.CustomerName?.Trim();
        if (string.IsNullOrWhiteSpace(customerName)) customerName = customer?.DisplayName;
        if (string.IsNullOrWhiteSpace(customerName)) customerName = "Walk-in customer";
        var email = input.CustomerEmail?.Trim().ToLowerInvariant() ?? customer?.Email;
        var phone = input.CustomerPhone?.Trim() ?? customer?.Phone;

        var variantIds = input.Items.Select(i => i.VariantId).Distinct().ToList();
        var variants = await _db.ProductVariants.Where(v => variantIds.Contains(v.Id)).ToDictionaryAsync(v => v.Id, ct);
        if (variants.Count != variantIds.Count)
            throw new DomainException(DomainErrors.NotFound, "One or more products are no longer available.");
        var productIds = variants.Values.Select(v => v.ProductId).Distinct().ToList();
        var products = await _db.Products.Where(p => productIds.Contains(p.Id) && !p.IsDeleted).ToDictionaryAsync(p => p.Id, ct);

        var stocks = await _db.StockItems
            .Where(s => s.WarehouseId == warehouse.Id && variantIds.Contains(s.VariantId))
            .ToDictionaryAsync(s => s.VariantId, ct);

        var priced = new List<(OrderLineInput Line, Domain.Catalog.ProductVariant Variant, Domain.Catalog.Product Product,
            PriceQuote Quote)>();
        foreach (var line in input.Items)
        {
            if (line.Quantity <= 0)
                throw new DomainException(DomainErrors.Validation, "Item quantities must be greater than zero.");
            var variant = variants[line.VariantId];
            if (!variant.IsActive)
                throw new DomainException(DomainErrors.Validation, $"Variant {variant.Sku} is not available.");
            var product = products.GetValueOrDefault(variant.ProductId)
                ?? throw new DomainException(DomainErrors.NotFound, "A product in this order is no longer available.");
            if (product.Status != Domain.ProductStatus.Active)
                throw new DomainException(DomainErrors.Validation, $"Product '{product.Name}' is not active.");

            var available = stocks.TryGetValue(variant.Id, out var stock) ? stock.QuantityOnHand - stock.QuantityReserved : 0;
            if (available < line.Quantity)
                throw new DomainException(DomainErrors.InsufficientStock,
                    $"Only {available} unit(s) of {product.Name} are available.");

            var quote = await _pricing.GetEffectivePriceAsync(variant.Id, line.Quantity, DateTime.UtcNow, ct);
            priced.Add((line, variant, product, quote));
        }

        var subtotal = priced.Sum(x => x.Quote.ListPrice * x.Line.Quantity);
        CouponQuote? coupon = null;
        if (!string.IsNullOrWhiteSpace(input.CouponCode))
            coupon = await _pricing.ValidateCouponAsync(input.CouponCode, subtotal, ct);

        var offerDiscount = priced.Sum(x => x.Quote.OfferDiscount * x.Line.Quantity);
        var couponDiscount = coupon?.DiscountAmount ?? 0m;
        var totalDiscount = Money.Round(offerDiscount + couponDiscount);
        if (totalDiscount > subtotal) totalDiscount = subtotal;

        var now = DateTime.UtcNow;
        var order = new Order
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            OrderNumber = await NextOrderNumberAsync(ct),
            CustomerId = customer?.Id,
            CustomerName = customerName,
            CustomerEmail = email,
            CustomerPhone = phone,
            Status = OrderStatus.Pending,
            PaymentStatus = OrderPaymentStatus.Unpaid,
            FulfillmentStatus = FulfillmentStatus.Unfulfilled,
            Subtotal = Money.Round(subtotal),
            DiscountTotal = totalDiscount,
            ShippingTotal = Money.Round(input.ShippingTotal),
            CouponCode = coupon?.Code,
            ShippingAddressJson = input.ShippingAddressJson ?? await DefaultAddressJsonAsync(customer?.Id, ct),
            Notes = input.Notes?.Trim(),
            Source = string.IsNullOrWhiteSpace(input.Source) ? "standalone" : input.Source.Trim(),
            ExternalOrderId = input.ExternalOrderId,
            PlacedAtUtc = now,
            CurrencyCode = priced[0].Product.CurrencyCode
        };

        var items = new List<OrderItem>();
        decimal taxTotal = 0m;
        var remainingCoupon = couponDiscount;
        for (var idx = 0; idx < priced.Count; idx++)
        {
            var (line, variant, product, quote) = priced[idx];
            var lineBase = Money.Round(quote.ListPrice * line.Quantity);
            var lineOfferDiscount = Money.Round(quote.OfferDiscount * line.Quantity);
            var share = idx == priced.Count - 1
                ? remainingCoupon
                : Money.Round(couponDiscount * (lineBase / Math.Max(1m, subtotal)));
            remainingCoupon -= share;
            var lineDiscount = Math.Min(lineBase, Money.Round(lineOfferDiscount + share));
            var taxable = Math.Max(0m, lineBase - lineDiscount);
            var tax = Money.Percent(taxable, product.TaxRate);
            taxTotal += tax;

            items.Add(new OrderItem
            {
                TenantId = _db.CurrentTenantId,
                WorkspaceId = _db.CurrentWorkspaceId,
                OrderId = order.Id,
                VariantId = variant.Id,
                ProductName = product.Name,
                Sku = variant.Sku,
                Quantity = line.Quantity,
                UnitPrice = quote.ListPrice,
                UnitCost = variant.CostPrice,
                DiscountAmount = lineDiscount,
                TaxAmount = tax,
                LineTotal = Money.Round(lineBase - lineDiscount + tax)
            });
        }

        order.TaxTotal = Money.Round(taxTotal);
        order.GrandTotal = Money.Round(order.Subtotal - order.DiscountTotal + order.TaxTotal + order.ShippingTotal);
        if (order.GrandTotal < 0) order.GrandTotal = 0;

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        _db.Orders.Add(order);
        _db.OrderItems.AddRange(items);

        foreach (var line in input.Items)
        {
            var stock = stocks[line.VariantId];
            stock.QuantityReserved += line.Quantity;
            _db.StockMovements.Add(new StockMovement
            {
                TenantId = _db.CurrentTenantId,
                WorkspaceId = _db.CurrentWorkspaceId,
                WarehouseId = warehouse.Id,
                VariantId = line.VariantId,
                Type = StockMovementType.Reservation,
                Quantity = line.Quantity,
                BalanceAfter = stock.QuantityOnHand,
                Reference = order.OrderNumber,
                Note = "Reserved for order"
            });
        }

        if (coupon is not null) await _pricing.RedeemCouponAsync(coupon.Id, ct);

        _db.OrderEvents.Add(new OrderEvent
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            OrderId = order.Id,
            Type = "created",
            Message = "Order placed",
            UserId = _tenant.UserId
        });

        _audit.Record("order.created", "Order", order.Id.ToString(), order.OrderNumber);
        _outbox.Enqueue("commerce.order.created", order.Id.ToString(), new
        {
            orderId = order.Id,
            orderNumber = order.OrderNumber,
            status = "PENDING",
            grandTotal = order.GrandTotal,
            currency = order.CurrencyCode,
            itemCount = items.Sum(i => i.Quantity)
        });

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await GetAsync(order.Id, ct);
    }

    public async Task<OrderView> ChangeStatusAsync(Guid id, OrderStatus target, string? note, CancellationToken ct = default)
    {
        var order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == id, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Order not found.");
        var items = await _db.OrderItems.Where(i => i.OrderId == id).ToListAsync(ct);
        var warehouse = await _inventory.GetDefaultWarehouseAsync(ct);
        var now = DateTime.UtcNow;

        if (target == order.Status)
            throw new DomainException(DomainErrors.InvalidState, $"Order is already {target}.");

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        switch (target)
        {
            case OrderStatus.Confirmed:
                if (order.Status != OrderStatus.Pending)
                    throw new DomainException(DomainErrors.InvalidState, "Only pending orders can be confirmed.");
                foreach (var item in items.Where(i => i.VariantId != null))
                {
                    var stock = await _db.StockItems.FirstOrDefaultAsync(s =>
                        s.WarehouseId == warehouse.Id && s.VariantId == item.VariantId, ct);
                    if (stock is null || stock.QuantityOnHand < item.Quantity)
                        throw new DomainException(DomainErrors.InsufficientStock, $"Not enough stock to confirm {item.ProductName}.");
                    stock.QuantityOnHand -= item.Quantity;
                    stock.QuantityReserved = Math.Max(0, stock.QuantityReserved - item.Quantity);
                    _db.StockMovements.Add(new StockMovement
                    {
                        TenantId = _db.CurrentTenantId,
                        WorkspaceId = _db.CurrentWorkspaceId,
                        WarehouseId = warehouse.Id,
                        VariantId = item.VariantId!.Value,
                        Type = StockMovementType.Sale,
                        Quantity = -item.Quantity,
                        BalanceAfter = stock.QuantityOnHand,
                        Reference = order.OrderNumber,
                        Note = "Order confirmed"
                    });
                }
                order.Status = OrderStatus.Confirmed;
                order.ConfirmedAtUtc = now;
                if (!await _db.Invoices.AnyAsync(i => i.OrderId == id, ct))
                    await CreateInvoiceAsync(order, ct);
                await AddEventAsync(order, "confirmed", note ?? "Order confirmed", ct);
                _outbox.Enqueue("commerce.order.confirmed", order.Id.ToString(), new
                {
                    orderId = order.Id, orderNumber = order.OrderNumber, status = "CONFIRMED",
                    grandTotal = order.GrandTotal, currency = order.CurrencyCode
                });
                break;

            case OrderStatus.Processing:
                if (order.Status != OrderStatus.Confirmed)
                    throw new DomainException(DomainErrors.InvalidState, "Only confirmed orders can move to processing.");
                order.Status = OrderStatus.Processing;
                await AddEventAsync(order, "processing", note ?? "Order is being prepared", ct);
                break;

            case OrderStatus.Shipped:
                if (order.Status is not (OrderStatus.Confirmed or OrderStatus.Processing))
                    throw new DomainException(DomainErrors.InvalidState, "Only confirmed or processing orders can ship.");
                order.Status = OrderStatus.Shipped;
                order.ShippedAtUtc = now;
                order.FulfillmentStatus = FulfillmentStatus.PartiallyFulfilled;
                await AddEventAsync(order, "shipped", note ?? "Order shipped", ct);
                _outbox.Enqueue("commerce.order.shipped", order.Id.ToString(), new
                {
                    orderId = order.Id, orderNumber = order.OrderNumber, status = "SHIPPED"
                });
                break;

            case OrderStatus.Delivered:
                if (order.Status != OrderStatus.Shipped)
                    throw new DomainException(DomainErrors.InvalidState, "Only shipped orders can be delivered.");
                order.Status = OrderStatus.Delivered;
                order.DeliveredAtUtc = now;
                order.FulfillmentStatus = FulfillmentStatus.Fulfilled;
                await AddEventAsync(order, "delivered", note ?? "Order delivered", ct);
                _outbox.Enqueue("commerce.order.delivered", order.Id.ToString(), new
                {
                    orderId = order.Id, orderNumber = order.OrderNumber, status = "DELIVERED", deliveredAt = now
                });
                break;

            case OrderStatus.Cancelled:
                if (order.Status is not (OrderStatus.Pending or OrderStatus.Confirmed or OrderStatus.Processing))
                    throw new DomainException(DomainErrors.InvalidState, "This order can no longer be cancelled.");
                var wasConfirmed = order.Status is OrderStatus.Confirmed or OrderStatus.Processing;
                foreach (var item in items.Where(i => i.VariantId != null))
                {
                    var stock = await _db.StockItems.FirstOrDefaultAsync(s =>
                        s.WarehouseId == warehouse.Id && s.VariantId == item.VariantId, ct);
                    if (stock is null) continue;
                    if (wasConfirmed)
                    {
                        stock.QuantityOnHand += item.Quantity;
                        _db.StockMovements.Add(new StockMovement
                        {
                            TenantId = _db.CurrentTenantId,
                            WorkspaceId = _db.CurrentWorkspaceId,
                            WarehouseId = warehouse.Id,
                            VariantId = item.VariantId!.Value,
                            Type = StockMovementType.Return,
                            Quantity = item.Quantity,
                            BalanceAfter = stock.QuantityOnHand,
                            Reference = order.OrderNumber,
                            Note = "Order cancelled - stock restored"
                        });
                    }
                    else
                    {
                        stock.QuantityReserved = Math.Max(0, stock.QuantityReserved - item.Quantity);
                        _db.StockMovements.Add(new StockMovement
                        {
                            TenantId = _db.CurrentTenantId,
                            WorkspaceId = _db.CurrentWorkspaceId,
                            WarehouseId = warehouse.Id,
                            VariantId = item.VariantId!.Value,
                            Type = StockMovementType.Release,
                            Quantity = -item.Quantity,
                            BalanceAfter = stock.QuantityOnHand,
                            Reference = order.OrderNumber,
                            Note = "Reservation released"
                        });
                    }
                }
                order.Status = OrderStatus.Cancelled;
                order.CancelledAtUtc = now;
                order.FulfillmentStatus = FulfillmentStatus.Unfulfilled;
                await AddEventAsync(order, "cancelled", note ?? "Order cancelled", ct);
                _outbox.Enqueue("commerce.order.cancelled", order.Id.ToString(), new
                {
                    orderId = order.Id, orderNumber = order.OrderNumber, status = "CANCELLED"
                });
                break;

            case OrderStatus.Returned:
                if (order.Status is not (OrderStatus.Delivered or OrderStatus.Shipped))
                    throw new DomainException(DomainErrors.InvalidState, "Only shipped or delivered orders can be returned.");
                order.Status = OrderStatus.Returned;
                await AddEventAsync(order, "returned", note ?? "Order returned", ct);
                break;

            case OrderStatus.Refunded:
                if (order.Status is OrderStatus.Cancelled or OrderStatus.Pending)
                    throw new DomainException(DomainErrors.InvalidState, "This order cannot be refunded in its current state.");
                order.Status = OrderStatus.Refunded;
                order.PaymentStatus = OrderPaymentStatus.Refunded;
                await AddEventAsync(order, "refunded", note ?? "Order refunded", ct);
                break;

            default:
                throw new DomainException(DomainErrors.InvalidState, "Unsupported order transition.");
        }

        _audit.Record("order.status_changed", "Order", order.Id.ToString(), $"{order.OrderNumber} -> {target}");
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await GetAsync(order.Id, ct);
    }

    public async Task<OrderView> CreateReturnAsync(Guid orderId, ReturnInput input, CancellationToken ct = default)
    {
        var order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Order not found.");
        if (order.Status is OrderStatus.Cancelled or OrderStatus.Pending)
            throw new DomainException(DomainErrors.InvalidState, "Only fulfilled orders can be returned.");
        if (input.RefundAmount < 0 || input.RefundAmount > order.GrandTotal)
            throw new DomainException(DomainErrors.Validation, "Refund amount exceeds the order total.");

        var ret = new OrderReturn
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            OrderId = orderId,
            Reason = input.Reason?.Trim() ?? string.Empty,
            RefundAmount = input.RefundAmount,
            ItemsJson = input.ItemsJson,
            Status = ReturnStatus.Requested
        };
        _db.OrderReturns.Add(ret);
        await AddEventAsync(order, "return.requested", input.Reason ?? "Return requested", ct);
        await _db.SaveChangesAsync(ct);
        return await GetAsync(orderId, ct);
    }

    public async Task<OrderView> ProcessReturnAsync(Guid orderId, Guid returnId, bool approve, CancellationToken ct = default)
    {
        var order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Order not found.");
        var ret = await _db.OrderReturns.FirstOrDefaultAsync(r => r.Id == returnId && r.OrderId == orderId, ct)
            ?? throw new DomainException(DomainErrors.NotFound, "Return not found.");
        if (ret.Status != ReturnStatus.Requested)
            throw new DomainException(DomainErrors.InvalidState, "This return has already been processed.");

        if (!approve)
        {
            ret.Status = ReturnStatus.Rejected;
            ret.ProcessedAtUtc = DateTime.UtcNow;
            await AddEventAsync(order, "return.rejected", "Return request rejected", ct);
            await _db.SaveChangesAsync(ct);
            return await GetAsync(orderId, ct);
        }

        var items = await _db.OrderItems.Where(i => i.OrderId == orderId).ToListAsync(ct);
        var warehouse = await _inventory.GetDefaultWarehouseAsync(ct);
        foreach (var item in items.Where(i => i.VariantId != null))
            await _inventory.ApplyMovementAsync(warehouse.Id, item.VariantId!.Value, item.Quantity,
                StockMovementType.Return, order.OrderNumber, "Customer return", ct);

        var refund = new Refund
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            OrderId = orderId,
            Amount = ret.RefundAmount,
            Reason = ret.Reason,
            Status = "completed",
            ProcessedAtUtc = DateTime.UtcNow
        };
        _db.Refunds.Add(refund);

        order.RefundedTotal += ret.RefundAmount;
        order.PaymentStatus = order.RefundedTotal >= order.PaidTotal && order.PaidTotal > 0
            ? OrderPaymentStatus.Refunded
            : OrderPaymentStatus.Partial;
        if (order.RefundedTotal >= order.GrandTotal)
            order.Status = OrderStatus.Refunded;

        ret.Status = ReturnStatus.Refunded;
        ret.ProcessedAtUtc = DateTime.UtcNow;
        await AddEventAsync(order, "return.approved", "Return approved and refund recorded", ct);
        _outbox.Enqueue("commerce.refund.completed", orderId.ToString(), new
        {
            orderId, orderNumber = order.OrderNumber, refundAmount = ret.RefundAmount, currency = order.CurrencyCode
        });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(orderId, ct);
    }

    public async Task<InvoiceView?> GetInvoiceAsync(Guid orderId, CancellationToken ct = default)
    {
        var invoice = await _db.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.OrderId == orderId, ct);
        return invoice is null ? null : new InvoiceView(invoice.Id, invoice.InvoiceNumber,
            invoice.IssuedAtUtc, invoice.DueAtUtc, invoice.Amount, invoice.Status);
    }

    private async Task AddEventAsync(Order order, string type, string? message, CancellationToken ct)
    {
        _db.OrderEvents.Add(new OrderEvent
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            OrderId = order.Id,
            Type = type,
            Message = message,
            UserId = _tenant.UserId
        });
        await Task.CompletedTask;
    }

    private async Task CreateInvoiceAsync(Order order, CancellationToken ct)
    {
        var count = await _db.Invoices.CountAsync(ct) + 1;
        var number = $"INV-{DateTime.UtcNow:yyyyMM}-{count:D4}";
        while (await _db.Invoices.AnyAsync(i => i.InvoiceNumber == number, ct))
            number = $"INV-{DateTime.UtcNow:yyyyMM}-{++count:D4}";
        _db.Invoices.Add(new Invoice
        {
            TenantId = _db.CurrentTenantId,
            WorkspaceId = _db.CurrentWorkspaceId,
            OrderId = order.Id,
            InvoiceNumber = number,
            Amount = order.GrandTotal,
            DueAtUtc = DateTime.UtcNow.AddDays(14)
        });
    }

    private async Task<string> NextOrderNumberAsync(CancellationToken ct)
    {
        var count = await _db.Orders.CountAsync(ct);
        var next = 1001 + count;
        var candidate = $"ORD-{next}";
        while (await _db.Orders.AnyAsync(o => o.OrderNumber == candidate, ct))
            candidate = $"ORD-{++next}";
        return candidate;
    }

    private async Task<string?> DefaultAddressJsonAsync(Guid? customerId, CancellationToken ct)
    {
        if (customerId is null) return null;
        var address = await _db.CustomerAddresses.AsNoTracking()
            .FirstOrDefaultAsync(a => a.CustomerId == customerId && a.IsDefault, ct)
            ?? await _db.CustomerAddresses.AsNoTracking().FirstOrDefaultAsync(a => a.CustomerId == customerId, ct);
        return address is null ? null : JsonSerializer.Serialize(new
        {
            line1 = address.Line1, line2 = address.Line2, city = address.City,
            state = address.State, postalCode = address.PostalCode, country = address.Country
        });
    }
}
