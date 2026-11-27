using Commerce.Domain;
using Commerce.Domain.Catalog;
using Commerce.Domain.Customers;
using Commerce.Domain.Inventory;
using Commerce.Domain.Orders;
using Commerce.Domain.Payments;
using Commerce.Domain.Pricing;
using Commerce.Domain.Purchasing;
using Commerce.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Commerce.Infrastructure.Seeding;

/// <summary>Creates a realistic demo dataset inside the current tenant/workspace. Used by registration and dev bootstrap.</summary>
public sealed class DemoDataSeeder
{
    private readonly CommerceDbContext _db;

    public DemoDataSeeder(CommerceDbContext db) => _db = db;

    public async Task SeedAsync(CommerceDbContext db, Guid workspaceId, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var tenantId = db.CurrentTenantId;
        var currency = (await db.Workspaces.IgnoreQueryFilters().FirstOrDefaultAsync(w => w.Id == workspaceId, ct))?.CurrencyCode ?? "USD";
        var warehouseId = (await db.Warehouses.IgnoreQueryFilters().FirstOrDefaultAsync(w => w.WorkspaceId == workspaceId && w.IsDefault, ct))?.Id
            ?? (await db.Warehouses.IgnoreQueryFilters().FirstOrDefaultAsync(w => w.WorkspaceId == workspaceId, ct))?.Id
            ?? Guid.NewGuid();

        if (await db.Categories.IgnoreQueryFilters().AnyAsync(c => c.WorkspaceId == workspaceId, ct))
            return; // already seeded

        Category Cat(string name, string slug) => new()
        {
            TenantId = tenantId, WorkspaceId = workspaceId, Name = name, Slug = slug,
            IsActive = true, CreatedAtUtc = now.AddDays(-45)
        };

        Brand MakeBrand(string name, string slug) => new()
        {
            TenantId = tenantId, WorkspaceId = workspaceId, Name = name, Slug = slug, CreatedAtUtc = now.AddDays(-45)
        };

        Customer MakeCustomer(string first, string last, string email, string phone, string city,
            bool isBusiness = false, string? company = null) => new()
        {
            TenantId = tenantId, WorkspaceId = workspaceId,
            FirstName = first, LastName = last, Email = email, Phone = phone,
            CompanyName = company, IsBusiness = isBusiness, Tags = isBusiness ? "wholesale" : "retail",
            CreatedAtUtc = now.AddDays(-40)
        };

        var phones = Cat("Phones", "phones");
        var laptops = Cat("Laptops", "laptops");
        var audio = Cat("Audio", "audio");
        var accessories = Cat("Accessories", "accessories");
        db.AddRange(phones, laptops, audio, accessories);

        var samsung = MakeBrand("Samsung", "samsung");
        var apple = MakeBrand("Apple", "apple");
        var anker = MakeBrand("Anker", "anker");
        var dell = MakeBrand("Dell", "dell");
        db.AddRange(samsung, apple, anker, dell);

        var variants = new List<(Product Product, ProductVariant Variant)>();
        (Product, ProductVariant) MakeProduct(string name, string sku, Category category, Brand brand,
            decimal cost, decimal price, decimal? compareAt, string description, int qty)
        {
            var product = new Product
            {
                TenantId = tenantId, WorkspaceId = workspaceId,
                Name = name, Slug = name.ToLowerInvariant().Replace(" ", "-").Replace("\"", ""),
                Sku = sku, ShortDescription = description, Description = description,
                CategoryId = category.Id, BrandId = brand.Id, Status = ProductStatus.Active,
                CostPrice = cost, BasePrice = price, CompareAtPrice = compareAt, TaxRate = 0m,
                CurrencyCode = currency, Tags = "demo", IsFeatured = price > 900m, CreatedAtUtc = now.AddDays(-40)
            };
            var variant = new ProductVariant
            {
                TenantId = tenantId, WorkspaceId = workspaceId,
                ProductId = product.Id, Name = "Default", Sku = sku,
                AttributesJson = "{\"condition\":\"new\"}", CostPrice = cost, Price = price,
                IsActive = true, IsDefault = true, CreatedAtUtc = now.AddDays(-40)
            };
            variants.Add((product, variant));
            return (product, variant);
        }

        MakeProduct("Samsung Galaxy A56 5G", "SAM-A56", phones, samsung, 310m, 449m, 499m,
            "6.7\" Super AMOLED, 256GB, 8GB RAM, 50MP camera.", 64);
        MakeProduct("Samsung Galaxy S25 Ultra", "SAM-S25U", phones, samsung, 890m, 1249m, 1349m,
            "Flagship performance with a 200MP camera and S Pen.", 22);
        MakeProduct("iPhone 16 Pro 128GB", "APL-IP16P", phones, apple, 910m, 1199m, 1299m,
            "A18 Pro chip, titanium design and 48MP Fusion camera.", 18);
        MakeProduct("iPhone 16 128GB", "APL-IP16", phones, apple, 720m, 899m, null,
            "A18 chip with Camera Control and all-day battery.", 30);
        MakeProduct("MacBook Air 13\" M3", "APL-MBA13", laptops, apple, 940m, 1099m, 1199m,
            "M3 chip, 8GB unified memory, 256GB SSD, 18-hour battery.", 12);
        MakeProduct("Dell XPS 14 Ultra", "DEL-XPS14", laptops, dell, 1180m, 1499m, null,
            "Intel Core Ultra 7, 32GB RAM, 1TB SSD, OLED display.", 9);
        MakeProduct("Anker Soundcore Space One", "ANK-SPACE1", audio, anker, 62m, 99m, 129m,
            "Adaptive noise cancelling over-ear headphones, 40h battery.", 48);
        MakeProduct("Anker 737 Power Bank 24K", "ANK-737", accessories, anker, 78m, 109m, null,
            "24,000mAh 140W fast-charging power bank with smart display.", 70);
        MakeProduct("Anker USB-C 100W Charger", "ANK-100W", accessories, anker, 24m, 39m, 49m,
            "Compact GaN charger with two USB-C ports.", 120);
        MakeProduct("Samsung 45W Travel Adapter", "SAM-45W", accessories, samsung, 18m, 29m, null,
            "Super fast charging 45W USB-C travel adapter.", 0);

        db.AddRange(variants.Select(v => v.Product));
        db.AddRange(variants.Select(v => v.Variant));

        foreach (var (product, variant) in variants)
        {
            var qty = variant.Sku switch
            {
                "SAM-A56" => 64, "SAM-S25U" => 22, "APL-IP16P" => 18, "APL-IP16" => 30,
                "APL-MBA13" => 12, "DEL-XPS14" => 9, "ANK-SPACE1" => 48, "ANK-737" => 70,
                "ANK-100W" => 120, _ => 0
            };
            db.Add(new StockItem
            {
                TenantId = tenantId, WorkspaceId = workspaceId,
                WarehouseId = warehouseId, VariantId = variant.Id,
                QuantityOnHand = qty, ReorderPoint = variant.Sku == "DEL-XPS14" ? 10 : 8,
                ReorderQuantity = 20, CreatedAtUtc = now.AddDays(-45)
            });
            if (qty > 0)
                db.Add(new StockMovement
                {
                    TenantId = tenantId, WorkspaceId = workspaceId,
                    WarehouseId = warehouseId, VariantId = variant.Id,
                    Type = StockMovementType.PurchaseReceipt, Quantity = qty, BalanceAfter = qty,
                    Reference = "DEMO-INITIAL", Note = "Opening stock", CreatedAtUtc = now.AddDays(-45)
                });
        }

        var customers = new List<Customer>
        {
            MakeCustomer("Ayesha", "Rahman", "ayesha.rahman@example.com", "+8801711000101", "Dhaka"),
            MakeCustomer("Daniel", "Fischer", "daniel.fischer@example.com", "+4915112345678", "Berlin"),
            MakeCustomer("Maya", "Costa", "maya.costa@example.com", "+5511998877665", "Sao Paulo", true, "Costa Studios"),
            MakeCustomer("Omar", "Haddad", "omar.haddad@example.com", "+971501234567", "Dubai"),
            MakeCustomer("Priya", "Sharma", "priya.sharma@example.com", "+919876543210", "Bengaluru"),
            MakeCustomer("Lucas", "Martin", "lucas.martin@example.com", "+33612345678", "Paris"),
            MakeCustomer("Sofia", "Andersson", "sofia.andersson@example.com", "+46701234567", "Stockholm", true, "Nordic Retail AB")
        };
        db.AddRange(customers);

        db.AddRange(
            new Offer
            {
                TenantId = tenantId, WorkspaceId = workspaceId, Name = "Flagship Week",
                Type = DiscountType.Percentage, Value = 10m, StartsAtUtc = now.AddDays(-10),
                EndsAtUtc = now.AddDays(20), IsActive = true, CategoryId = phones.Id
            },
            new Offer
            {
                TenantId = tenantId, WorkspaceId = workspaceId, Name = "Audio Clearance",
                Type = DiscountType.FixedAmount, Value = 15m, StartsAtUtc = now.AddDays(-30),
                EndsAtUtc = now.AddDays(3), IsActive = true, CategoryId = audio.Id
            },
            new Offer
            {
                TenantId = tenantId, WorkspaceId = workspaceId, Name = "Accessory Bundle",
                Type = DiscountType.Percentage, Value = 5m, StartsAtUtc = now.AddDays(-5),
                EndsAtUtc = now.AddMonths(2), IsActive = true, AppliesToAllProducts = true
            },
            new Offer
            {
                TenantId = tenantId, WorkspaceId = workspaceId, Name = "Expired Laptop Promo",
                Type = DiscountType.Percentage, Value = 20m, StartsAtUtc = now.AddDays(-60),
                EndsAtUtc = now.AddDays(-30), IsActive = true, CategoryId = laptops.Id
            });

        db.AddRange(
            new Coupon
            {
                TenantId = tenantId, WorkspaceId = workspaceId, Code = "WELCOME10",
                Type = DiscountType.Percentage, Value = 10m, MinOrderSubtotal = 100m,
                StartsAtUtc = now.AddDays(-60), EndsAtUtc = now.AddDays(60), IsActive = true, MaxRedemptions = 500
            },
            new Coupon
            {
                TenantId = tenantId, WorkspaceId = workspaceId, Code = "SAVE25",
                Type = DiscountType.FixedAmount, Value = 25m, MinOrderSubtotal = 200m,
                StartsAtUtc = now.AddDays(-30), EndsAtUtc = now.AddDays(90), IsActive = true, MaxRedemptions = 100
            });

        var orders = new List<Order>();
        var items = new List<OrderItem>();
        var orderEvents = new List<OrderEvent>();

        void AddOrder(int index, Customer? customer, DateTime placed, OrderStatus status,
            OrderPaymentStatus payStatus, (ProductVariant Variant, int Qty)[] lines, decimal discount = 0m,
            string? coupon = null)
        {
            var order = new Order
            {
                TenantId = tenantId, WorkspaceId = workspaceId,
                OrderNumber = $"ORD-{1001 + index}",
                CustomerId = customer?.Id,
                CustomerName = customer?.DisplayName ?? "Walk-in customer",
                CustomerEmail = customer?.Email,
                CustomerPhone = customer?.Phone,
                Status = status,
                PaymentStatus = payStatus,
                FulfillmentStatus = status switch
                {
                    OrderStatus.Delivered => FulfillmentStatus.Fulfilled,
                    OrderStatus.Shipped => FulfillmentStatus.PartiallyFulfilled,
                    _ => FulfillmentStatus.Unfulfilled
                },
                CouponCode = coupon,
                PlacedAtUtc = placed,
                ConfirmedAtUtc = status >= OrderStatus.Confirmed ? placed.AddHours(1) : null,
                ShippedAtUtc = status is OrderStatus.Shipped or OrderStatus.Delivered ? placed.AddDays(1) : null,
                DeliveredAtUtc = status == OrderStatus.Delivered ? placed.AddDays(2) : null,
                CancelledAtUtc = status == OrderStatus.Cancelled ? placed.AddDays(1) : null,
                Source = "standalone",
                CurrencyCode = currency
            };

            decimal subtotal = 0, tax = 0;
            foreach (var (variant, qty) in lines)
            {
                var product = variants.First(v => v.Variant.Id == variant.Id).Product;
                var lineBase = variant.Price * qty;
                subtotal += lineBase;
                items.Add(new OrderItem
                {
                    TenantId = tenantId, WorkspaceId = workspaceId, OrderId = order.Id,
                    VariantId = variant.Id, ProductName = product.Name, Sku = variant.Sku,
                    Quantity = qty, UnitPrice = variant.Price, UnitCost = variant.CostPrice,
                    DiscountAmount = 0, TaxAmount = 0, LineTotal = lineBase,
                    CreatedAtUtc = placed
                });
            }

            order.Subtotal = subtotal;
            order.DiscountTotal = discount;
            order.TaxTotal = tax;
            order.ShippingTotal = subtotal > 500 ? 0m : 12m;
            order.GrandTotal = Math.Max(0, subtotal - discount + tax + order.ShippingTotal);
            order.PaidTotal = payStatus == OrderPaymentStatus.Paid ? order.GrandTotal
                : payStatus == OrderPaymentStatus.Partial ? Math.Round(order.GrandTotal / 2m, 2) : 0m;

            orders.Add(order);
            orderEvents.Add(new OrderEvent
            {
                TenantId = tenantId, WorkspaceId = workspaceId, OrderId = order.Id,
                Type = "created", Message = "Order placed", CreatedAtUtc = placed
            });
            if (status >= OrderStatus.Confirmed)
                orderEvents.Add(new OrderEvent
                {
                    TenantId = tenantId, WorkspaceId = workspaceId, OrderId = order.Id,
                    Type = "confirmed", Message = "Order confirmed", CreatedAtUtc = placed.AddHours(1)
                });
        }

        ProductVariant V(string sku) => variants.First(v => v.Variant.Sku == sku).Variant;
        var a56 = V("SAM-A56");
        var ultra = V("SAM-S25U");
        var iphonePro = V("APL-IP16P");
        var iphone = V("APL-IP16");
        var macbook = V("APL-MBA13");
        var dellXps = V("DEL-XPS14");
        var headphones = V("ANK-SPACE1");
        var powerbank = V("ANK-737");
        var charger = V("ANK-100W");

        AddOrder(0, customers[0], now.AddDays(-43), OrderStatus.Delivered, OrderPaymentStatus.Paid, [(a56, 1), (charger, 2)]);
        AddOrder(1, customers[1], now.AddDays(-38), OrderStatus.Delivered, OrderPaymentStatus.Paid, [(iphonePro, 1)]);
        AddOrder(2, customers[2], now.AddDays(-31), OrderStatus.Delivered, OrderPaymentStatus.Paid, [(macbook, 2), (headphones, 1)]);
        AddOrder(3, customers[3], now.AddDays(-25), OrderStatus.Delivered, OrderPaymentStatus.Paid, [(ultra, 1), (powerbank, 1)]);
        AddOrder(4, customers[4], now.AddDays(-19), OrderStatus.Shipped, OrderPaymentStatus.Paid, [(iphone, 2)]);
        AddOrder(5, customers[5], now.AddDays(-14), OrderStatus.Processing, OrderPaymentStatus.Partial, [(dellXps, 1)]);
        AddOrder(6, customers[6], now.AddDays(-9), OrderStatus.Confirmed, OrderPaymentStatus.Paid,
            [(headphones, 4), (powerbank, 2)], Math.Round(4 * 99m * 0.10m, 2), "WELCOME10");
        AddOrder(7, customers[0], now.AddDays(-6), OrderStatus.Cancelled, OrderPaymentStatus.Unpaid, [(charger, 3)]);
        AddOrder(8, customers[2], now.AddDays(-3), OrderStatus.Pending, OrderPaymentStatus.Unpaid, [(macbook, 1)]);
        AddOrder(9, customers[3], now.AddDays(-1), OrderStatus.Pending, OrderPaymentStatus.Unpaid, [(a56, 2), (charger, 1)]);

        db.AddRange(orders);
        db.AddRange(items);
        db.AddRange(orderEvents);

        foreach (var order in orders.Where(o => o.PaymentStatus is OrderPaymentStatus.Paid or OrderPaymentStatus.Partial))
        {
            db.Add(new Payment
            {
                TenantId = tenantId, WorkspaceId = workspaceId,
                OrderId = order.Id, CustomerId = order.CustomerId,
                Direction = PaymentDirection.Incoming,
                Method = orders.IndexOf(order) % 2 == 0 ? "card" : "bank",
                Amount = order.PaidTotal, CurrencyCode = currency,
                Status = PaymentRecordStatus.Completed,
                Reference = $"PAY-{order.OrderNumber}",
                PaidAtUtc = order.PlacedAtUtc.AddHours(2)
            });
        }

        db.AddRange(
            new Expense
            {
                TenantId = tenantId, WorkspaceId = workspaceId, Category = "marketing",
                Description = "Paid social campaign", Amount = 480m,
                PaidAtUtc = now.AddDays(-20), Method = "card"
            },
            new Expense
            {
                TenantId = tenantId, WorkspaceId = workspaceId, Category = "logistics",
                Description = "Courier settlement", Amount = 210m,
                PaidAtUtc = now.AddDays(-8), Method = "bank"
            },
            new Expense
            {
                TenantId = tenantId, WorkspaceId = workspaceId, Category = "software",
                Description = "Commerce platform hosting", Amount = 95m,
                PaidAtUtc = now.AddDays(-2), Method = "card"
            });

        var supplier = new Supplier
        {
            TenantId = tenantId, WorkspaceId = workspaceId,
            Name = "Global Device Distribution", ContactName = "Nadia Karim",
            Email = "orders@gdd.example.com", Phone = "+8809610000111",
            Address = "Gulshan 2, Dhaka", IsActive = true
        };
        db.Add(supplier);

        var po = new PurchaseOrder
        {
            TenantId = tenantId, WorkspaceId = workspaceId,
            PoNumber = "PO-2001", SupplierId = supplier.Id, Status = PurchaseOrderStatus.Ordered,
            OrderDateUtc = now.AddDays(-5), ExpectedDateUtc = now.AddDays(4),
            Subtotal = 11300m, TaxTotal = 0m, Total = 11300m, AmountPaid = 0m, CurrencyCode = currency
        };
        db.Add(po);
        db.AddRange(
            new PurchaseOrderItem
            {
                TenantId = tenantId, WorkspaceId = workspaceId, PurchaseOrderId = po.Id,
                VariantId = ultra.Id, ProductName = variants.First(v => v.Variant.Id == ultra.Id).Product.Name,
                Sku = ultra.Sku, QuantityOrdered = 10, QuantityReceived = 0,
                UnitCost = 890m, LineTotal = 8900m
            },
            new PurchaseOrderItem
            {
                TenantId = tenantId, WorkspaceId = workspaceId, PurchaseOrderId = po.Id,
                VariantId = charger.Id, ProductName = variants.First(v => v.Variant.Id == charger.Id).Product.Name,
                Sku = charger.Sku, QuantityOrdered = 100, QuantityReceived = 0,
                UnitCost = 24m, LineTotal = 2400m
            });

        await db.SaveChangesAsync(ct);
    }
}
