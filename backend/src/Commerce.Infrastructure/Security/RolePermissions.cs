using Commerce.Domain;

namespace Commerce.Infrastructure.Security;

public static class RolePermissions
{
    public static readonly string[] All =
    [
        "dashboard.read", "products.read", "products.write", "categories.write",
        "inventory.read", "inventory.write", "orders.read", "orders.write",
        "customers.read", "customers.write", "offers.read", "offers.write",
        "purchasing.read", "purchasing.write", "finance.read", "finance.write",
        "reports.read", "settings.read", "settings.write", "users.manage",
        "integrations.manage", "audit.read"
    ];

    public static readonly string[] ReadOnly =
    [
        "dashboard.read", "products.read", "inventory.read", "orders.read", "customers.read",
        "offers.read", "purchasing.read", "finance.read", "reports.read", "settings.read"
    ];

    public static string[] For(UserRole role) => role switch
    {
        UserRole.Owner or UserRole.Admin => All,
        UserRole.Manager =>
        [
            .. ReadOnly, "products.write", "categories.write", "inventory.write", "orders.write",
            "customers.write", "offers.write", "purchasing.write", "finance.write"
        ],
        UserRole.Staff =>
        [
            .. ReadOnly, "inventory.write", "orders.write", "customers.write"
        ],
        _ => ReadOnly
    };

    public static bool CanWrite(UserRole role) => role is UserRole.Owner or UserRole.Admin or UserRole.Manager or UserRole.Staff;
    public static bool IsManager(UserRole role) => role is UserRole.Owner or UserRole.Admin or UserRole.Manager;
    public static bool IsAdmin(UserRole role) => role is UserRole.Owner or UserRole.Admin;
}
