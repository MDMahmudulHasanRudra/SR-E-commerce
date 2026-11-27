"use client";

import { useMemo, useState } from "react";
import { download, query } from "@/lib/api";
import { errorMessage, useApi } from "@/lib/hooks";
import type { CustomerReport, ProductPerformance, SalesReport, StockReportRow } from "@/lib/types";
import { compactCurrency, currency, percent } from "@/lib/format";
import { AreaChart, BarChart, ProgressBar } from "@/components/charts";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusBadge,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableSkeleton,
  Tabs,
  cn,
  useToast,
} from "@/components/ui";

type Range = "30d" | "90d" | "12m" | "all";

function rangeDates(range: Range): { from?: string; to?: string } {
  if (range === "all") return {};
  const days = range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function ReportsPage() {
  const { push } = useToast();
  const [tab, setTab] = useState("sales");
  const [range, setRange] = useState<Range>("30d");
  const [lowOnly, setLowOnly] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const dates = useMemo(() => rangeDates(range), [range]);

  const sales = useApi<SalesReport>(`/api/v1/reports/sales${query(dates)}`);
  const products = useApi<ProductPerformance[]>(`/api/v1/reports/products${query({ ...dates, take: 50 })}`);
  const customers = useApi<CustomerReport>(`/api/v1/reports/customers${query(dates)}`);
  const stock = useApi<StockReportRow[]>(`/api/v1/reports/stock${query({ lowStock: lowOnly })}`);

  async function exportCsv(type: string, filename: string) {
    setExporting(type);
    try {
      await download(`/api/v1/reports/export${query({ type, ...dates })}`, filename);
      push({ title: "Export ready", description: `${filename} was downloaded.` });
    } catch (cause) {
      push({ tone: "error", title: "Export failed", description: errorMessage(cause) });
    } finally {
      setExporting(null);
    }
  }

  const maxStatus = Math.max(...(sales.data?.byStatus.map((entry) => entry.count) ?? [1]), 1);
  const maxProductRevenue = Math.max(...(products.data?.map((row) => row.revenue) ?? [1]), 1);
  const stockValue = (stock.data ?? []).reduce((sum, row) => sum + row.stockValue, 0);
  const lowStock = (stock.data ?? []).filter((row) => row.lowStock).length;
  const unitsOnHand = (stock.data ?? []).reduce((sum, row) => sum + row.onHand, 0);
  const availableUnits = (stock.data ?? []).reduce((sum, row) => sum + row.available, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Reports"
        description="Sales, product, customer and stock reporting derived from immutable order and inventory records."
      >
        <div className="flex rounded-lg border border-line bg-surface p-0.5">
          {(
            [
              { value: "30d", label: "30 days" },
              { value: "90d", label: "90 days" },
              { value: "12m", label: "12 months" },
              { value: "all", label: "All time" },
            ] as { value: Range; label: string }[]
          ).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setRange(item.value)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                range === item.value ? "bg-[#f0eee6] text-ink" : "text-muted hover:text-ink-soft",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          icon="download"
          loading={exporting === tab}
          onClick={() => {
            const labels: Record<string, [string, string]> = {
              sales: ["sales", "sales-report.csv"],
              products: ["products", "product-performance.csv"],
              customers: ["customers", "customer-report.csv"],
              stock: ["stock", "stock-report.csv"],
            };
            const [type, filename] = labels[tab] ?? labels.sales;
            void exportCsv(type, filename);
          }}
        >
          Export CSV
        </Button>
      </PageHeader>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "sales", label: "Sales" },
          { value: "products", label: "Products" },
          { value: "customers", label: "Customers" },
          { value: "stock", label: "Stock" },
        ]}
      />

      {tab === "sales" && (
        sales.loading ? (
          <ReportSkeleton />
        ) : sales.error ? (
          <Card>
            <ErrorState message={sales.error.message} onRetry={sales.reload} />
          </Card>
        ) : sales.data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Gross sales" value={currency(sales.data.grossSales)} hint={`${sales.data.orderCount} orders`} />
              <Metric label="Net sales" value={currency(sales.data.netSales)} hint="After discounts and refunds" accent="text-emerald-700" />
              <Metric label="Discounts" value={currency(sales.data.discounts)} hint="Offers and coupons" accent="text-amber-700" />
              <Metric label="Average order" value={currency(sales.data.averageOrderValue)} hint={`Tax ${currency(sales.data.tax)}`} />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader title="Revenue trend" description={`${sales.data.from} → ${sales.data.to}`} />
                <div className="px-3 pb-3 pt-5">
                  <AreaChart
                    data={sales.data.trend.map((point) => ({ label: point.date, value: point.revenue }))}
                    height={280}
                    formatValue={(value) => compactCurrency(value)}
                  />
                </div>
              </Card>
              <Card>
                <CardHeader title="Orders by status" description="Order lifecycle mix" />
                <div className="space-y-3 p-5">
                  {sales.data.byStatus.length === 0 && <p className="text-xs text-muted">No orders in this range.</p>}
                  {sales.data.byStatus.map((entry) => (
                    <div key={entry.status}>
                      <div className="flex items-center justify-between gap-2 text-[11.5px]">
                        <StatusBadge status={entry.status} dot={false} />
                        <span className="num font-medium text-ink-soft">{entry.count}</span>
                      </div>
                      <ProgressBar value={entry.count} max={maxStatus} className="mt-1.5" />
                    </div>
                  ))}
                </div>
                <div className="border-t border-line px-5 py-3">
                  <p className="text-[10.5px] text-muted">
                    Payment mix:{" "}
                    {sales.data.byPaymentStatus.map((entry) => `${entry.status} ${entry.count}`).join(" · ") || "—"}
                  </p>
                </div>
              </Card>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Tax collected" value={currency(sales.data.tax)} hint="Recorded on line items" />
              <Metric label="Shipping" value={currency(sales.data.shipping)} hint="Charged to customers" />
              <Metric label="Refunds" value={currency(sales.data.refunds)} hint="Returned to customers" accent="text-violet-700" />
            </div>
          </>
        ) : null
      )}

      {tab === "products" && (
        products.loading ? (
          <Card>
            <TableSkeleton rows={9} columns={6} />
          </Card>
        ) : products.error ? (
          <Card>
            <ErrorState message={products.error.message} onRetry={products.reload} />
          </Card>
        ) : (products.data?.length ?? 0) === 0 ? (
          <Card>
            <EmptyState icon="box" title="No product sales" description="Products will appear once orders are placed in this range." />
          </Card>
        ) : (
          <Card>
            <CardHeader
              title="Product performance"
              description="Ranked by revenue in the selected period"
              action={<Badge tone="zinc">{products.data?.length ?? 0} products</Badge>}
            />
            <Table className="min-w-[760px]">
              <THead>
                <tr>
                  <TH>Product</TH>
                  <TH>SKU</TH>
                  <TH align="right">Units sold</TH>
                  <TH align="right">Revenue</TH>
                  <TH align="right">Profit</TH>
                  <TH align="right">Margin</TH>
                  <TH className="w-[140px]"></TH>
                </tr>
              </THead>
              <tbody>
                {(products.data ?? []).map((row) => {
                  const margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
                  return (
                    <TR key={row.productId}>
                      <TD className="max-w-[240px] truncate text-[12.5px] font-medium">{row.name}</TD>
                      <TD className="font-mono text-[10.5px] text-muted">{row.sku}</TD>
                      <TD align="right" className="num text-[12px]">{row.unitsSold}</TD>
                      <TD align="right" className="num text-[12.5px] font-medium">{currency(row.revenue)}</TD>
                      <TD align="right" className="num text-[12px] text-emerald-700">{currency(row.profit)}</TD>
                      <TD align="right" className="num text-[11.5px] text-muted">{percent(margin)}</TD>
                      <TD>
                        <ProgressBar value={row.revenue} max={maxProductRevenue} />
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )
      )}

      {tab === "customers" && (
        customers.loading ? (
          <ReportSkeleton />
        ) : customers.error ? (
          <Card>
            <ErrorState message={customers.error.message} onRetry={customers.reload} />
          </Card>
        ) : customers.data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Total customers" value={String(customers.data.totalCustomers)} hint="All records" />
              <Metric label="New customers" value={String(customers.data.newCustomers)} hint="In this period" accent="text-sky-700" />
              <Metric label="Repeat customers" value={String(customers.data.repeatCustomers)} hint="Two or more orders" accent="text-emerald-700" />
              <Metric label="Average lifetime value" value={currency(customers.data.averageLifetimeValue)} hint="Per customer" />
            </div>
            <Card>
              <CardHeader title="Acquisition and orders" description="New customers compared with order volume" />
              <div className="px-3 pb-3 pt-4">
                <BarChart
                  data={customers.data.trend.map((point) => ({
                    label: point.period,
                    value: point.newCustomers,
                    secondary: point.orders,
                  }))}
                  height={300}
                  formatValue={(value) => String(Math.round(value))}
                  secondaryLabel="New customers"
                />
              </div>
            </Card>
          </>
        ) : null
      )}

      {tab === "stock" && (
        stock.loading ? (
          <Card>
            <TableSkeleton rows={9} columns={6} />
          </Card>
        ) : stock.error ? (
          <Card>
            <ErrorState message={stock.error.message} onRetry={stock.reload} />
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Units on hand" value={String(unitsOnHand)} hint={`${availableUnits} available`} />
              <Metric label="Stock value" value={currency(stockValue)} hint="At cost price" accent="text-emerald-700" />
              <Metric label="Variants tracked" value={String(stock.data?.length ?? 0)} hint="Across all warehouses" />
              <Metric label="Low stock" value={String(lowStock)} hint="At or below reorder point" accent={lowStock > 0 ? "text-rose-600" : "text-ink"} />
            </div>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold">Stock valuation</p>
                  <p className="text-[11px] text-muted">Current quantities valued at variant cost price</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLowOnly((value) => !value)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    lowOnly
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-line bg-surface text-muted hover:text-ink",
                  )}
                >
                  Low stock only
                </button>
              </div>
              {(stock.data?.length ?? 0) === 0 ? (
                <EmptyState icon="warehouse" title="No stock rows" description="Receive stock or adjust inventory to populate this report." />
              ) : (
                <Table className="min-w-[720px]">
                  <THead>
                    <tr>
                      <TH>Product</TH>
                      <TH>SKU</TH>
                      <TH align="right">On hand</TH>
                      <TH align="right">Reserved</TH>
                      <TH align="right">Available</TH>
                      <TH align="right">Reorder point</TH>
                      <TH align="right">Stock value</TH>
                      <TH>State</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {(stock.data ?? []).map((row) => (
                      <TR key={row.variantId}>
                        <TD className="max-w-[240px] truncate text-[12.5px] font-medium">{row.productName}</TD>
                        <TD className="font-mono text-[10.5px] text-muted">{row.sku}</TD>
                        <TD align="right" className="num text-[12px]">{row.onHand}</TD>
                        <TD align="right" className="num text-[12px] text-muted">{row.reserved}</TD>
                        <TD align="right" className="num text-[12px]">{row.available}</TD>
                        <TD align="right" className="num text-[11.5px] text-muted">{row.reorderPoint}</TD>
                        <TD align="right" className="num text-[12px] font-medium">{currency(row.stockValue)}</TD>
                        <TD>
                          <Badge tone={row.lowStock ? "rose" : "emerald"} dot>
                            {row.lowStock ? "Low" : "Healthy"}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        )
      )}

      <div className="flex items-center gap-2 text-[10.5px] text-muted">
        <Icon name="shield" size={11} />
        Reports are generated server-side from the active workspace only. Exports respect the same tenant boundary.
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  accent = "text-ink",
}: {
  label: string;
  value: string;
  hint: string;
  accent?: string;
}) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`num mt-1 text-xl font-semibold leading-none ${accent}`}>{value}</p>
      <p className="mt-1 text-[10px] text-muted">{hint}</p>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[340px] rounded-xl" />
    </>
  );
}
