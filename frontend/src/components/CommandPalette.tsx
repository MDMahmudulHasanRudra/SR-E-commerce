"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { api, query, type Paged } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import type { CustomerListItem, OrderListItem, ProductListItem } from "@/lib/types";
import { currency } from "@/lib/format";
import { Icon, type IconName } from "./icons";
import { Kbd, Spinner, StatusBadge } from "./ui";

type QuickAction = { label: string; href: string; hint: string; icon: IconName };

const QUICK_ROUTES: QuickAction[] = [
  { label: "Dashboard", href: "/dashboard", hint: "Overview & alerts", icon: "dashboard" },
  { label: "Products", href: "/products", hint: "Catalog & pricing", icon: "box" },
  { label: "New product", href: "/products/new", hint: "Create SKU & variants", icon: "plus" },
  { label: "Categories", href: "/categories", hint: "Product hierarchy", icon: "folder" },
  { label: "Brands", href: "/brands", hint: "Brand directory", icon: "award" },
  { label: "Inventory", href: "/inventory", hint: "Warehouses & movements", icon: "warehouse" },
  { label: "Orders", href: "/orders", hint: "Sales & fulfilment", icon: "orders" },
  { label: "New order", href: "/orders?new=1", hint: "Create sales order", icon: "plus" },
  { label: "Customers", href: "/customers", hint: "CRM & external links", icon: "users" },
  { label: "Offers & coupons", href: "/offers", hint: "Promotions & quote calculator", icon: "tag" },
  { label: "Purchasing", href: "/purchasing", hint: "Suppliers & POs", icon: "truck" },
  { label: "Finance", href: "/finance", hint: "Payments, refunds, expenses", icon: "wallet" },
  { label: "Reports", href: "/reports", hint: "Analytics & CSV exports", icon: "chart" },
  { label: "Settings", href: "/settings", hint: "Company, team, roles, theme", icon: "settings" },
  { label: "Integration", href: "/integration", hint: "Get Assist API keys & outbox", icon: "plug" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term, 180);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);

  useEffect(() => {
    if (!open) {
      setTerm("");
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const q = debounced.trim();
    if (!q) {
      setProducts([]);
      setOrders([]);
      setCustomers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api<Paged<ProductListItem>>(`/api/v1/products${query({ search: q, pageSize: 5 })}`).catch(() => ({ items: [] })),
      api<Paged<OrderListItem>>(`/api/v1/orders${query({ search: q, pageSize: 5 })}`).catch(() => ({ items: [] })),
      api<Paged<CustomerListItem>>(`/api/v1/customers${query({ search: q, pageSize: 5 })}`).catch(() => ({ items: [] })),
    ])
      .then(([p, o, c]) => {
        if (cancelled) return;
        setProducts(p.items ?? []);
        setOrders(o.items ?? []);
        setCustomers(c.items ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, debounced]);

  const filteredRoutes = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return QUICK_ROUTES.slice(0, 8);
    return QUICK_ROUTES.filter(
      (item) => item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q),
    );
  }, [term]);

  if (!open || typeof document === "undefined") return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-[#0e100c]/45 p-4 pt-[10vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
        className="animate-scale-in w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Icon name="search" size={16} className="shrink-0 text-muted" />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search products, orders, customers, or jump to a page…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-[#a6a99e] focus:outline-none"
          />
          {loading && <Spinner size={14} className="text-brand" />}
          <Kbd>Esc</Kbd>
        </div>

        <div className="max-h-[60vh] divide-y divide-[#efede5] overflow-y-auto">
          {products.length > 0 && (
            <div className="p-2">
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                Products
              </p>
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => go(`/products/${product.id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[#f5f3ec]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon name="box" size={14} className="shrink-0 text-muted" />
                    <span className="truncate font-medium text-ink">{product.name}</span>
                    <span className="font-mono text-[10px] text-muted">{product.sku}</span>
                  </span>
                  <span className="num shrink-0 font-medium text-ink-soft">
                    {currency(product.price, product.currencyCode)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {orders.length > 0 && (
            <div className="p-2">
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                Orders
              </p>
              {orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => go(`/orders/${order.id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[#f5f3ec]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon name="orders" size={14} className="shrink-0 text-muted" />
                    <span className="font-mono font-medium text-ink">{order.orderNumber}</span>
                    <span className="truncate text-muted">{order.customerName}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={order.status} dot={false} />
                    <span className="num font-medium">{currency(order.grandTotal, order.currencyCode)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {customers.length > 0 && (
            <div className="p-2">
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                Customers
              </p>
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => go(`/customers/${customer.id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[#f5f3ec]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon name="users" size={14} className="shrink-0 text-muted" />
                    <span className="truncate font-medium text-ink">{customer.displayName}</span>
                    <span className="truncate text-[11px] text-muted">{customer.email ?? customer.phone ?? ""}</span>
                  </span>
                  <span className="num shrink-0 text-[11px] text-muted">{customer.orderCount} orders</span>
                </button>
              ))}
            </div>
          )}

          <div className="p-2">
            <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Navigate
            </p>
            {filteredRoutes.length === 0 ? (
              <p className="px-2.5 py-4 text-center text-xs text-muted">No matching pages.</p>
            ) : (
              <div className="grid sm:grid-cols-2">
                {filteredRoutes.map((route) => (
                  <button
                    key={route.href}
                    type="button"
                    onClick={() => go(route.href)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[#f5f3ec]"
                  >
                    <Icon name={route.icon} size={14} className="shrink-0 text-brand" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{route.label}</span>
                      <span className="block truncate text-[10px] text-muted">{route.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
