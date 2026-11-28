import type { AuthUser } from "./session";

export type RoleName = "Owner" | "Admin" | "Manager" | "Staff" | "Viewer";

export const ROLE_HIERARCHY: Record<RoleName, number> = {
  Viewer: 1,
  Staff: 2,
  Manager: 3,
  Admin: 4,
  Owner: 5,
};

export function hasMinRole(role: string | null | undefined, required: RoleName): boolean {
  if (!role) return false;
  const current = ROLE_HIERARCHY[role as RoleName] ?? 0;
  return current >= ROLE_HIERARCHY[required];
}

export function hasPermission(user: AuthUser | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (user.role === "Owner" || user.role === "Admin") return true;
  return user.permissions?.includes(permission) ?? false;
}

export const ROLE_MATRIX: {
  module: string;
  permission: string;
  Viewer: boolean;
  Staff: boolean;
  Manager: boolean;
  Admin: boolean;
  Owner: boolean;
}[] = [
  { module: "Dashboard & Reports", permission: "dashboard.read / reports.read", Viewer: true, Staff: true, Manager: true, Admin: true, Owner: true },
  { module: "Catalog (Read & Export)", permission: "products.read", Viewer: true, Staff: true, Manager: true, Admin: true, Owner: true },
  { module: "Catalog (Products, Categories, Brands, Import)", permission: "products.write / categories.write", Viewer: false, Staff: false, Manager: true, Admin: true, Owner: true },
  { module: "Inventory (View Stock & Movements)", permission: "inventory.read", Viewer: true, Staff: true, Manager: true, Admin: true, Owner: true },
  { module: "Inventory (Adjust Stock)", permission: "inventory.write (Staff+)", Viewer: false, Staff: true, Manager: true, Admin: true, Owner: true },
  { module: "Inventory (Warehouses & Transfers)", permission: "inventory.write (Manager+)", Viewer: false, Staff: false, Manager: true, Admin: true, Owner: true },
  { module: "Orders (Create, Status, Request Return)", permission: "orders.write (Staff+)", Viewer: false, Staff: true, Manager: true, Admin: true, Owner: true },
  { module: "Orders (Approve / Reject Returns)", permission: "orders.write (Manager+)", Viewer: false, Staff: false, Manager: true, Admin: true, Owner: true },
  { module: "Customers (Create, Update, Addresses)", permission: "customers.write", Viewer: false, Staff: true, Manager: true, Admin: true, Owner: true },
  { module: "Customers (Delete & External Mapping)", permission: "customers.write (Manager+)", Viewer: false, Staff: false, Manager: true, Admin: true, Owner: true },
  { module: "Offers & Coupons", permission: "offers.write", Viewer: false, Staff: false, Manager: true, Admin: true, Owner: true },
  { module: "Purchasing & Suppliers", permission: "purchasing.write", Viewer: false, Staff: false, Manager: true, Admin: true, Owner: true },
  { module: "Finance (Record Payments)", permission: "finance.write (Staff+)", Viewer: false, Staff: true, Manager: true, Admin: true, Owner: true },
  { module: "Finance (Refunds & Expenses)", permission: "finance.write (Manager+)", Viewer: false, Staff: false, Manager: true, Admin: true, Owner: true },
  { module: "Settings, Team, Tax Rates & Audit Log", permission: "settings.write / users.manage / audit.read", Viewer: false, Staff: false, Manager: false, Admin: true, Owner: true },
  { module: "Integration, API Keys & Outbox", permission: "integrations.manage", Viewer: false, Staff: false, Manager: false, Admin: true, Owner: true },
];
