"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useApi } from "@/lib/hooks";
import type { CompanySettings, InvoiceDetail, OrderDetail } from "@/lib/types";
import { currency, date } from "@/lib/format";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, ErrorState, Skeleton, StatusBadge } from "@/components/ui";

export default function OrderInvoicePage() {
  const params = useParams<{ id: string }>();
  const order = useApi<OrderDetail>(`/api/v1/orders/${params.id}`);
  const invoice = useApi<InvoiceDetail>(`/api/v1/orders/${params.id}/invoice`);
  const company = useApi<CompanySettings>("/api/v1/settings/company");

  if (order.loading || invoice.loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-[640px] rounded-xl" />
      </div>
    );
  }

  if (order.error || !order.data) {
    return (
      <Card className="mx-auto max-w-3xl">
        <ErrorState message={order.error?.message ?? "Order not found."} onRetry={order.reload} />
      </Card>
    );
  }

  if (invoice.error || !invoice.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href={`/orders/${order.data.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-ink"
        >
          <Icon name="chevronLeft" size={13} /> Back to order
        </Link>
        <Card>
          <ErrorState
            message={
              invoice.error?.message ??
              "No invoice has been issued yet. Confirm the order first to generate a tax invoice."
            }
            onRetry={invoice.reload}
          />
        </Card>
      </div>
    );
  }

  const data = order.data;
  const inv = invoice.data;
  const balance = Math.max(0, data.grandTotal - data.paidTotal + data.refundedTotal);

  let shippingLines: string[] = [];
  if (data.shippingAddressJson) {
    try {
      const addr = JSON.parse(data.shippingAddressJson) as Record<string, unknown>;
      shippingLines = [
        addr.line1,
        addr.line2,
        [addr.city, addr.state, addr.postalCode].filter(Boolean).join(", "),
        addr.country,
      ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    } catch {
      shippingLines = [data.shippingAddressJson];
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/orders/${data.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          <Icon name="chevronLeft" size={14} /> Back to {data.orderNumber}
        </Link>
        <div className="flex items-center gap-2">
          <StatusBadge status={data.paymentStatus} />
          <Button variant="primary" icon="printer" onClick={() => window.print()}>
            Print / Save PDF
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border-line bg-white p-8 sm:p-10 print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Tax Invoice</p>
            <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight text-ink">{inv.invoiceNumber}</h1>
            <p className="mt-1 text-xs text-muted">Order {data.orderNumber}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm font-semibold text-ink">{company.data?.companyName ?? "Commerce Workspace"}</p>
            <p className="mt-0.5 text-xs text-muted">{company.data?.workspaceName ?? "Main Store"}</p>
            <div className="mt-2 inline-block">
              <Badge tone={balance <= 0 ? "emerald" : "amber"}>{inv.status}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">Billed To</p>
            <p className="mt-1.5 text-sm font-medium text-ink">{data.customerName}</p>
            {data.customerEmail && <p className="text-xs text-muted">{data.customerEmail}</p>}
            {data.customerPhone && <p className="text-xs text-muted">{data.customerPhone}</p>}
            {shippingLines.length > 0 && (
              <address className="mt-2 not-italic text-xs leading-relaxed text-ink-soft">
                {shippingLines.map((line, i) => (
                  <span key={`${line}-${i}`} className="block">
                    {line}
                  </span>
                ))}
              </address>
            )}
          </div>
          <div className="space-y-1.5 text-xs sm:text-right">
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <span className="text-muted">Issued date</span>
              <span className="font-medium text-ink">{date(inv.issuedAtUtc)}</span>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <span className="text-muted">Due date</span>
              <span className="font-medium text-ink">{date(inv.dueAtUtc)}</span>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <span className="text-muted">Currency</span>
              <span className="font-mono font-medium text-ink">{data.currencyCode}</span>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <span className="text-muted">Payment status</span>
              <span className="font-medium text-ink">{data.paymentStatus}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-[0.08em] text-muted">
                <th className="py-2.5 pr-4 font-semibold">Item</th>
                <th className="py-2.5 px-3 text-right font-semibold">Qty</th>
                <th className="py-2.5 px-3 text-right font-semibold">Unit price</th>
                <th className="py-2.5 px-3 text-right font-semibold">Discount</th>
                <th className="py-2.5 px-3 text-right font-semibold">Tax</th>
                <th className="py-2.5 pl-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#efede5]">
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-ink">{item.productName}</p>
                    <p className="font-mono text-[10px] text-muted">{item.sku}</p>
                  </td>
                  <td className="num py-3 px-3 text-right">{item.quantity}</td>
                  <td className="num py-3 px-3 text-right">{currency(item.unitPrice, data.currencyCode)}</td>
                  <td className="num py-3 px-3 text-right text-muted">
                    {item.discountAmount > 0 ? `−${currency(item.discountAmount, data.currencyCode)}` : "—"}
                  </td>
                  <td className="num py-3 px-3 text-right text-muted">{currency(item.taxAmount, data.currencyCode)}</td>
                  <td className="num py-3 pl-3 text-right font-medium text-ink">
                    {currency(item.lineTotal, data.currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end border-t border-line pt-5">
          <div className="w-full max-w-[280px] space-y-2 text-xs">
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span className="num text-ink-soft">{currency(data.subtotal, data.currencyCode)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Discounts{data.couponCode ? ` (${data.couponCode})` : ""}</span>
              <span className="num text-ink-soft">−{currency(data.discountTotal, data.currencyCode)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Tax</span>
              <span className="num text-ink-soft">{currency(data.taxTotal, data.currencyCode)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Shipping</span>
              <span className="num text-ink-soft">{currency(data.shippingTotal, data.currencyCode)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
              <span>Invoice total</span>
              <span className="num">{currency(inv.amount, data.currencyCode)}</span>
            </div>
            <div className="flex justify-between text-emerald-700">
              <span>Paid</span>
              <span className="num">{currency(data.paidTotal, data.currencyCode)}</span>
            </div>
            <div className="flex justify-between font-medium text-ink">
              <span>Balance due</span>
              <span className="num">{currency(balance, data.currencyCode)}</span>
            </div>
          </div>
        </div>

        {data.notes && (
          <div className="mt-6 rounded-lg border border-line bg-[#faf9f5] p-3 text-[11px] text-muted">
            <span className="font-medium text-ink-soft">Notes: </span>
            {data.notes}
          </div>
        )}
      </Card>
    </div>
  );
}
