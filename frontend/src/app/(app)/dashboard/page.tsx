"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import type { DashboardData } from "@/lib/types";
import { compactCurrency, currency, dateTime, number, relative } from "@/lib/format";
import { AreaChart, ProgressBar } from "@/components/charts";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  PageHeader,
  Skeleton,
  StatCard,
  StatusBadge,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth } from "@/components/AuthProvider";

export default function DashboardPage() {
  const { session } = useAuth();
  const { data, loading, error, reload } = useApi<DashboardData>("/api/v1/dashboard");
  const [range, setRange] = useState<"14" | "30">("30");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = session?.user.fullName.split(" ")[0] ?? "there";

  const trend = useMemo(() => {
    if (!data) return [];
    return range === "14" ? data.salesTrend.slice(-14) : data.salesTrend;
  }, [data, range]);

  const trendRevenue = trend.reduce((sum, point) => sum + point.revenue, 0);
  const maxProduct = Math.max(...(data?.topProducts.map((product) => product.revenue) ?? [1]), 1);
  const revenueDelta =
    data && data.revenuePrevious30 > 0
      ? ((data.revenueLast30 - data.revenuePrevious30) / data.revenuePrevious30) * 100
      : undefined;

  if (error && !loading) {
    return (
      <>
        <PageHeader title="Dashboard" description="Live view of your workspace." />
        <Card className="mt-6">
          <ErrorState message={error.message} onRetry={reload} />
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        title={`${greeting}, ${firstName}`}
        description={
          data
            ? `${session?.user.workspaceName ?? "Your workspace"} is tracking ${data.orders} orders and ${data.customers} customers.`
            : "Here is what is moving across your workspace."
        }
      >
        <Link href="/reports">
          <Button variant="secondary" size="md" icon="chart">
            View reports
          </Button>
        </Link>
        <Link href="/orders?new=1">
          <Button variant="primary" size="md" icon="plus">
            New order
          </Button>
        </Link>
      </PageHeader>

      {loading || !data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[142px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <Skeleton className="h-[360px] rounded-xl xl:col-span-2" />
            <Skeleton className="h-[360px] rounded-xl" />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Revenue · last 30 days"
              value={currency(data.revenueLast30, data.currencyCode)}
              delta={revenueDelta}
              deltaLabel={`vs ${currency(data.revenuePrevious30, data.currencyCode)} previous 30`}
              icon="wallet"
              tone="brand"
              spark={data.salesTrend.slice(-14).map((point) => point.revenue)}
            />
            <StatCard
              label="Orders"
              value={number(data.orders)}
              hint={`${data.pendingOrders} awaiting confirmation`}
              icon="orders"
              tone="blue"
              spark={data.salesTrend.slice(-14).map((point) => point.orders)}
              sparkColor="#5b7fb8"
            />
            <StatCard
              label="Average order value"
              value={currency(data.averageOrderValue, data.currencyCode)}
              hint={`${currency(data.totalSales, data.currencyCode)} total sales`}
              icon="chart"
              tone="violet"
            />
            <StatCard
              label="Low stock"
              value={number(data.lowStockCount)}
              hint={data.lowStockCount > 0 ? "Items at or below reorder point" : "All items above reorder point"}
              icon="alert"
              tone={data.lowStockCount > 0 ? "amber" : "zinc"}
              href="/inventory?lowStock=1"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-[13px] font-semibold tracking-tight">Sales performance</h2>
                  <p className="mt-0.5 text-xs text-muted">Daily net revenue across the workspace</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="num text-[17px] font-semibold leading-none tracking-tight">
                      {currency(trendRevenue, data.currencyCode)}
                    </p>
                    <p className="mt-1 text-[10.5px] text-muted">last {range} days</p>
                  </div>
                  <div className="flex rounded-lg border border-line bg-[#f3f1ea] p-0.5">
                    {(["14", "30"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRange(value)}
                        className={`rounded-md px-2 py-1 text-[10.5px] font-medium transition-colors ${
                          range === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink-soft"
                        }`}
                      >
                        {value}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-3 pb-3 pt-5">
                <AreaChart
                  data={trend.map((point) => ({ label: point.date, value: point.revenue }))}
                  height={272}
                  formatValue={(value) => compactCurrency(value, data.currencyCode)}
                />
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Needs attention"
                description="Signals from inventory and order flow"
                action={<Badge tone="zinc">{data.alerts.length}</Badge>}
              />
              <div className="divide-y divide-[#efede5]">
                {data.alerts.length === 0 && (
                  <p className="px-5 py-8 text-center text-xs text-muted">Nothing needs attention right now.</p>
                )}
                {data.alerts.map((alert) => (
                  <Link
                    key={alert.title}
                    href={alert.action ?? "/dashboard"}
                    className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-[#faf9f5]"
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        alert.level === "warning" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      <Icon name={alert.level === "warning" ? "alert" : "sparkle"} size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium leading-snug text-ink">{alert.title}</span>
                      {alert.detail && (
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{alert.detail}</span>
                      )}
                    </span>
                    <Icon
                      name="chevronRight"
                      size={14}
                      className="mt-1 shrink-0 text-[#b6b9ae] transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-1">
              <CardHeader
                title="Top products"
                description="By revenue in the last 30 days"
                action={
                  <Link href="/reports" className="text-[11px] font-medium text-brand hover:underline">
                    All reports
                  </Link>
                }
              />
              <div className="divide-y divide-[#efede5]">
                {data.topProducts.slice(0, 5).map((product, index) => (
                  <Link
                    key={product.productId}
                    href={`/products/${product.productId}`}
                    className="block px-5 py-3 transition-colors hover:bg-[#faf9f5]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#f1efe7] text-[10px] font-semibold text-muted">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium text-ink">{product.name}</p>
                        <p className="mt-0.5 text-[10.5px] text-muted">
                          {product.sku} · {product.unitsSold} sold
                        </p>
                      </div>
                      <p className="num shrink-0 text-[12px] font-medium text-ink-soft">
                        {currency(product.revenue, data.currencyCode)}
                      </p>
                    </div>
                    <ProgressBar value={product.revenue} max={maxProduct} className="mt-2.5" />
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader
                title="Recent activity"
                description="Latest orders and payments across the workspace"
                action={
                  <Link href="/orders" className="text-[11px] font-medium text-brand hover:underline">
                    View all orders
                  </Link>
                }
              />
              <Table className="min-w-[620px]">
                <THead>
                  <tr>
                    <TH>Event</TH>
                    <TH>Reference</TH>
                    <TH>Counterparty</TH>
                    <TH align="right">Amount</TH>
                    <TH>Status</TH>
                    <TH align="right">When</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.recentTransactions.map((transaction) => (
                    <TR key={`${transaction.type}-${transaction.reference}`}>
                      <TD>
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-soft">
                          <Icon
                            name={transaction.type === "Payment" ? "wallet" : "orders"}
                            size={13}
                            className="text-muted"
                          />
                          {transaction.type}
                        </span>
                      </TD>
                      <TD className="font-mono text-[11px] text-ink-soft">{transaction.reference}</TD>
                      <TD className="max-w-[160px] truncate text-[12px] text-muted">
                        {transaction.counterparty || "—"}
                      </TD>
                      <TD align="right" className="num text-[12px] font-medium">
                        {currency(transaction.amount, data.currencyCode)}
                      </TD>
                      <TD>
                        <StatusBadge status={transaction.status} />
                      </TD>
                      <TD align="right" className="text-[11px] text-muted">
                        {relative(transaction.at)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[10.5px] text-muted">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live workspace data
                </span>
                <span>Updated {dateTime(data.generatedAtUtc)}</span>
              </div>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[#989c90]">
            <span>
              Amounts in {data.currencyCode} · all totals calculated server-side
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="clock" size={11} /> Generated {dateTime(data.generatedAtUtc)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
