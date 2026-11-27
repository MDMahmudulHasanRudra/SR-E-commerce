"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi, errorMessage } from "@/lib/hooks";
import type { OrderDetail } from "@/lib/types";
import { currency, dateTime, relative } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  InfoRow,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tabs,
  Textarea,
  cn,
  useToast,
} from "@/components/ui";

type Action = { label: string; target: string; tone?: "primary" | "secondary" | "danger" };

const actionsFor = (status: string): Action[] => {
  switch (status) {
    case "Pending":
      return [
        { label: "Confirm order", target: "Confirmed", tone: "primary" },
        { label: "Cancel", target: "Cancelled", tone: "danger" },
      ];
    case "Confirmed":
      return [
        { label: "Start processing", target: "Processing" },
        { label: "Mark shipped", target: "Shipped" },
        { label: "Cancel", target: "Cancelled", tone: "danger" },
      ];
    case "Processing":
      return [
        { label: "Mark shipped", target: "Shipped", tone: "primary" },
        { label: "Cancel", target: "Cancelled", tone: "danger" },
      ];
    case "Shipped":
      return [{ label: "Mark delivered", target: "Delivered", tone: "primary" }];
    default:
      return [];
  }
};

const methods = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
  { value: "mobile", label: "Mobile money" },
];

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { push } = useToast();
  const { data, loading, error, reload, setData } = useApi<OrderDetail>(`/api/v1/orders/${params.id}`);
  const [tab, setTab] = useState("timeline");

  const [statusAction, setStatusAction] = useState<Action | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "cash",
    reference: "",
    notes: "",
  });
  const [paymentBusy, setPaymentBusy] = useState(false);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnForm, setReturnForm] = useState({ reason: "", amount: "" });
  const [returnBusy, setReturnBusy] = useState(false);

  const balance = useMemo(
    () => (data ? Math.max(0, data.grandTotal - data.paidTotal + data.refundedTotal) : 0),
    [data],
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          <Skeleton className="h-[420px] rounded-xl" />
          <Skeleton className="h-[420px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-ink"
        >
          <Icon name="chevronLeft" size={13} /> Back to orders
        </Link>
        <Card>
          <ErrorState message={error?.message ?? "Order not found."} onRetry={reload} />
        </Card>
      </div>
    );
  }

  const actions = actionsFor(data.status);
  const canReturn = !["Pending", "Cancelled"].includes(data.status);
  const canPay = data.status !== "Cancelled" && balance > 0;

  async function changeStatus() {
    if (!statusAction || !data) return;
    setStatusBusy(true);
    try {
      const updated = await api<OrderDetail>(`/api/v1/orders/${data.id}/status`, {
        method: "POST",
        body: { status: statusAction.target, note: statusNote || null },
      });
      setData(updated);
      push({
        title: `Order ${statusAction.target.toLowerCase()}`,
        description: statusAction.target === "Confirmed" ? "Stock is now committed and an invoice has been issued." : undefined,
      });
      setStatusAction(null);
      setStatusNote("");
    } catch (cause) {
      push({ tone: "error", title: "Could not change order status", description: errorMessage(cause) });
    } finally {
      setStatusBusy(false);
    }
  }

  async function recordPayment() {
    if (!data) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      push({ tone: "error", title: "Enter a valid payment amount" });
      return;
    }
    setPaymentBusy(true);
    try {
      await api("/api/v1/payments", {
        method: "POST",
        body: {
          orderId: data.id,
          amount,
          method: paymentForm.method,
          reference: paymentForm.reference || null,
          notes: paymentForm.notes || null,
          paidAtUtc: null,
          customerId: data.customerId ?? null,
        },
      });
      await reload();
      push({ title: "Payment recorded", description: `${currency(amount, data.currencyCode)} applied to ${data.orderNumber}.` });
      setPaymentOpen(false);
      setPaymentForm({ amount: "", method: "cash", reference: "", notes: "" });
    } catch (cause) {
      push({ tone: "error", title: "Could not record payment", description: errorMessage(cause) });
    } finally {
      setPaymentBusy(false);
    }
  }

  async function requestReturn() {
    if (!data) return;
    const amount = Number(returnForm.amount);
    if (!returnForm.reason.trim()) {
      push({ tone: "error", title: "A return reason is required" });
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      push({ tone: "error", title: "Enter a valid refund amount" });
      return;
    }
    setReturnBusy(true);
    try {
      const updated = await api<OrderDetail>(`/api/v1/orders/${data.id}/returns`, {
        method: "POST",
        body: { reason: returnForm.reason, refundAmount: amount },
      });
      setData(updated);
      push({ title: "Return requested", description: "A manager can approve or reject it from the returns tab." });
      setReturnOpen(false);
      setReturnForm({ reason: "", amount: "" });
      setTab("returns");
    } catch (cause) {
      push({ tone: "error", title: "Could not create return", description: errorMessage(cause) });
    } finally {
      setReturnBusy(false);
    }
  }

  async function processReturn(returnId: string, approve: boolean) {
    if (!data) return;
    try {
      const updated = await api<OrderDetail>(`/api/v1/orders/${data.id}/returns/${returnId}/process`, {
        method: "POST",
        body: { approve },
      });
      setData(updated);
      push({
        title: approve ? "Return approved" : "Return rejected",
        description: approve ? "Stock has been restored and the refund recorded." : undefined,
      });
    } catch (cause) {
      push({ tone: "error", title: "Could not process return", description: errorMessage(cause) });
    }
  }

  const pendingReturns = data.returns.filter((item) => item.status === "Requested").length;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/orders"
          className="mb-3 inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-ink"
        >
          <Icon name="chevronLeft" size={13} /> Back to orders
        </Link>
        <PageHeader eyebrow="Order" title={data.orderNumber} description={`Placed ${dateTime(data.placedAtUtc)} · ${data.items.length} line item(s)`}>
          <StatusBadge status={data.paymentStatus} />
          <StatusBadge status={data.status} />
          {canPay && (
            <Button variant="secondary" icon="wallet" onClick={() => {
              setPaymentForm((current) => ({ ...current, amount: balance.toFixed(2) }));
              setPaymentOpen(true);
            }}>
              Record payment
            </Button>
          )}
          {actions.map((action) => (
            <Button
              key={action.target}
              variant={action.tone ?? "secondary"}
              onClick={() => {
                setStatusAction(action);
                setStatusNote("");
              }}
            >
              {action.label}
            </Button>
          ))}
        </PageHeader>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Order total</p>
          <p className="num mt-1 text-xl font-semibold leading-none">{currency(data.grandTotal, data.currencyCode)}</p>
          <p className="mt-1 text-[10px] text-muted">{data.currencyCode} · tax inclusive</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Paid</p>
          <p className="num mt-1 text-xl font-semibold leading-none text-emerald-700">
            {currency(data.paidTotal, data.currencyCode)}
          </p>
          <p className="mt-1 text-[10px] text-muted">{data.payments.length} payment(s)</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Balance due</p>
          <p className={cn("num mt-1 text-xl font-semibold leading-none", balance > 0 ? "text-amber-600" : "text-ink")}>
            {currency(balance, data.currencyCode)}
          </p>
          <p className="mt-1 text-[10px] text-muted">{balance > 0 ? "Outstanding on this order" : "Settled"}</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Refunded</p>
          <p className="num mt-1 text-xl font-semibold leading-none text-violet-700">
            {currency(data.refundedTotal, data.currencyCode)}
          </p>
          <p className="mt-1 text-[10px] text-muted">{data.returns.length} return request(s)</p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Line items"
              description={`${data.items.reduce((sum, item) => sum + item.quantity, 0)} unit(s) across ${data.items.length} line(s)`}
              action={<StatusBadge status={data.fulfillmentStatus} />}
            />
            <Table className="min-w-[640px]">
              <THead>
                <tr>
                  <TH>Item</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Unit price</TH>
                  <TH align="right">Discount</TH>
                  <TH align="right">Tax</TH>
                  <TH align="right">Line total</TH>
                </tr>
              </THead>
              <tbody>
                {data.items.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <p className="text-[12.5px] font-medium text-ink">{item.productName}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted">{item.sku}</p>
                    </TD>
                    <TD align="right" className="num text-[12px]">
                      {item.quantity}
                    </TD>
                    <TD align="right" className="num text-[12px]">
                      {currency(item.unitPrice, data.currencyCode)}
                    </TD>
                    <TD align="right" className="num text-[12px] text-muted">
                      {item.discountAmount > 0 ? `−${currency(item.discountAmount, data.currencyCode)}` : "—"}
                    </TD>
                    <TD align="right" className="num text-[12px] text-muted">
                      {currency(item.taxAmount, data.currencyCode)}
                    </TD>
                    <TD align="right" className="num text-[12.5px] font-medium">
                      {currency(item.lineTotal, data.currencyCode)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <div className="border-t border-line px-5 py-4">
              <div className="ml-auto max-w-[280px] space-y-2 text-[12px]">
                <div className="flex justify-between text-muted">
                  <span>Subtotal</span>
                  <span className="num text-ink-soft">{currency(data.subtotal, data.currencyCode)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Discounts{data.couponCode ? ` · ${data.couponCode}` : ""}</span>
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
                <div className="flex justify-between border-t border-line pt-2 text-[13px] font-semibold text-ink">
                  <span>Total</span>
                  <span className="num">{currency(data.grandTotal, data.currencyCode)}</span>
                </div>
                {data.refundedTotal > 0 && (
                  <div className="flex justify-between text-violet-700">
                    <span>Refunded</span>
                    <span className="num">−{currency(data.refundedTotal, data.currencyCode)}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "timeline", label: "Timeline", count: data.events.length },
                  { value: "payments", label: "Payments", count: data.payments.length },
                  { value: "returns", label: "Returns", count: data.returns.length },
                ]}
              />
              {canReturn && (
                <Button variant="secondary" size="sm" icon="refresh" onClick={() => {
                  setReturnForm({ reason: "", amount: String(data.grandTotal) });
                  setReturnOpen(true);
                }}>
                  Request return
                </Button>
              )}
            </div>

            {tab === "timeline" && (
              <ol className="space-y-0 px-5 py-4">
                {data.events.length === 0 && <p className="py-6 text-center text-xs text-muted">No events yet.</p>}
                {data.events.map((event, index) => (
                  <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {index < data.events.length - 1 && (
                      <span className="absolute left-[11px] top-6 h-full w-px bg-[#e7e5dc]" aria-hidden="true" />
                    )}
                    <span className="relative z-10 mt-0.5 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted">
                      <Icon name={eventIcon(event.type)} size={11} />
                    </span>
                    <div className="min-w-0 flex-1 pb-0.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[12px] font-medium text-ink">{eventLabel(event.type)}</p>
                        <p className="text-[10.5px] text-muted" title={dateTime(event.createdAtUtc)}>
                          {relative(event.createdAtUtc)}
                        </p>
                      </div>
                      {event.message && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{event.message}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {tab === "payments" && (
              data.payments.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-xs text-muted">No payments recorded yet.</p>
                  {canPay && (
                    <Button variant="primary" size="sm" icon="wallet" className="mt-3" onClick={() => setPaymentOpen(true)}>
                      Record payment
                    </Button>
                  )}
                </div>
              ) : (
                <Table className="min-w-[520px]">
                  <THead>
                    <tr>
                      <TH>Method</TH>
                      <TH>Reference</TH>
                      <TH>Status</TH>
                      <TH>Paid</TH>
                      <TH align="right">Amount</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {data.payments.map((payment) => (
                      <TR key={payment.id}>
                        <TD className="text-[12px] capitalize">{payment.method}</TD>
                        <TD className="font-mono text-[10.5px] text-muted">{payment.reference ?? "—"}</TD>
                        <TD>
                          <StatusBadge status={payment.status} />
                        </TD>
                        <TD className="text-[11px] text-muted">{dateTime(payment.paidAtUtc)}</TD>
                        <TD align="right" className="num text-[12.5px] font-medium">
                          {currency(payment.amount, data.currencyCode)}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )
            )}

            {tab === "returns" && (
              data.returns.length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-muted">
                  No returns requested.{pendingReturns > 0 ? "" : " Fulfilled orders can be returned from here."}
                </div>
              ) : (
                <div className="divide-y divide-[#efede5]">
                  {data.returns.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={item.status} />
                          <span className="num text-[12px] font-medium text-ink">
                            {currency(item.refundAmount, data.currencyCode)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-soft">{item.reason || "No reason supplied."}</p>
                        <p className="mt-1 text-[10px] text-muted">
                          Requested {dateTime(item.createdAtUtc)}
                          {item.processedAtUtc ? ` · Processed ${dateTime(item.processedAtUtc)}` : ""}
                        </p>
                      </div>
                      {item.status === "Requested" && (
                        <div className="flex gap-1.5">
                          <Button variant="secondary" size="sm" onClick={() => void processReturn(item.id, false)}>
                            Reject
                          </Button>
                          <Button variant="primary" size="sm" icon="check" onClick={() => void processReturn(item.id, true)}>
                            Approve
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Customer" />
            <CardBody className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar name={data.customerName} size={38} />
                <div className="min-w-0">
                  {data.customerId ? (
                    <Link href={`/customers/${data.customerId}`} className="block truncate text-[13px] font-medium text-ink hover:text-brand">
                      {data.customerName}
                    </Link>
                  ) : (
                    <p className="truncate text-[13px] font-medium text-ink">{data.customerName}</p>
                  )}
                  <p className="truncate text-[11px] text-muted">{data.customerEmail ?? "No email on file"}</p>
                </div>
              </div>
              <div className="space-y-0.5 border-t border-line pt-2 text-[11.5px] text-muted">
                {data.customerEmail && (
                  <p className="flex items-center gap-2">
                    <Icon name="mail" size={12} /> {data.customerEmail}
                  </p>
                )}
                {data.customerPhone && (
                  <p className="flex items-center gap-2">
                    <Icon name="phone" size={12} /> {data.customerPhone}
                  </p>
                )}
                {!data.customerEmail && !data.customerPhone && <p>Guest checkout — no contact details.</p>}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Shipping" action={<Badge tone="zinc">{data.source ?? "standalone"}</Badge>} />
            <CardBody>
              {data.shippingAddressJson ? (
                <ShippingAddress json={data.shippingAddressJson} />
              ) : (
                <p className="text-[11.5px] text-muted">No shipping address was supplied.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Invoice" action={<Badge tone={data.invoice ? "brand" : "zinc"}>{data.invoice ? data.invoice.status : "Not issued"}</Badge>} />
            {data.invoice ? (
              <CardBody className="divide-y divide-[#efede5] py-0">
                <InfoRow label="Number" value={<span className="font-mono text-[11px]">{data.invoice.invoiceNumber}</span>} />
                <InfoRow label="Issued" value={dateTime(data.invoice.issuedAtUtc)} />
                <InfoRow label="Due" value={dateTime(data.invoice.dueAtUtc)} />
                <InfoRow label="Amount" value={currency(data.invoice.amount, data.currencyCode)} />
              </CardBody>
            ) : (
              <CardBody>
                <p className="text-[11.5px] leading-relaxed text-muted">
                  An invoice is issued automatically when this order is confirmed. Pending orders do not have a
                  tax invoice.
                </p>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody className="divide-y divide-[#efede5] py-0">
              <InfoRow label="Payment status" value={<StatusBadge status={data.paymentStatus} />} />
              <InfoRow label="Fulfillment" value={<StatusBadge status={data.fulfillmentStatus} />} />
              <InfoRow label="Coupon" value={data.couponCode ?? "—"} />
              <InfoRow label="External order" value={data.externalOrderId ?? "—"} />
              <InfoRow label="Placed" value={dateTime(data.placedAtUtc)} />
              {data.confirmedAtUtc && <InfoRow label="Confirmed" value={dateTime(data.confirmedAtUtc)} />}
              {data.shippedAtUtc && <InfoRow label="Shipped" value={dateTime(data.shippedAtUtc)} />}
              {data.deliveredAtUtc && <InfoRow label="Delivered" value={dateTime(data.deliveredAtUtc)} />}
              {data.cancelledAtUtc && <InfoRow label="Cancelled" value={dateTime(data.cancelledAtUtc)} />}
            </CardBody>
          </Card>

          {data.notes && (
            <Card>
              <CardHeader title="Internal note" />
              <CardBody>
                <p className="text-[11.5px] leading-relaxed text-ink-soft">{data.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(statusAction)}
        onClose={() => setStatusAction(null)}
        title={statusAction ? `${statusAction.label}?` : "Change status"}
        description={
          statusAction?.target === "Confirmed"
            ? "Confirming commits stock, releases the reservation and issues an invoice."
            : statusAction?.target === "Cancelled"
              ? "Cancelling releases or restores stock depending on the current stage."
              : "The change is recorded in the order timeline."
        }
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setStatusAction(null)} disabled={statusBusy}>
              Cancel
            </Button>
            <Button
              variant={statusAction?.tone === "danger" ? "danger" : "primary"}
              size="sm"
              loading={statusBusy}
              onClick={() => void changeStatus()}
            >
              {statusAction?.label}
            </Button>
          </>
        }
      >
        <Field label="Note (optional)" hint="Shown on the order timeline.">
          <Textarea
            value={statusNote}
            onChange={(event) => setStatusNote(event.target.value)}
            placeholder="Add context for the team…"
            rows={3}
          />
        </Field>
      </Modal>

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Record a payment"
        description={`Outstanding balance ${currency(balance, data.currencyCode)}.`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPaymentOpen(false)} disabled={paymentBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="wallet" loading={paymentBusy} onClick={() => void recordPayment()}>
              Record payment
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void recordPayment();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount" required>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={paymentForm.amount}
                onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })}
                required
              />
            </Field>
            <Field label="Method" required>
              <Select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>
                {methods.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Reference">
            <Input
              value={paymentForm.reference}
              onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })}
              placeholder="Transaction or receipt reference"
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={paymentForm.notes}
              onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })}
              rows={2}
              placeholder="Optional note for the finance team"
            />
          </Field>
        </form>
      </Modal>

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Request a return"
        description="Returns restore stock and create a refund once approved by a manager."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setReturnOpen(false)} disabled={returnBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={returnBusy} onClick={() => void requestReturn()}>
              Submit request
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void requestReturn();
          }}
        >
          <Field label="Reason" required>
            <Textarea
              value={returnForm.reason}
              onChange={(event) => setReturnForm({ ...returnForm, reason: event.target.value })}
              placeholder="Why is this order being returned?"
              rows={3}
              required
            />
          </Field>
          <Field label="Refund amount" required hint={`Maximum ${currency(data.grandTotal, data.currencyCode)} for this order.`}>
            <Input
              type="number"
              min="0"
              step="0.01"
              max={data.grandTotal}
              value={returnForm.amount}
              onChange={(event) => setReturnForm({ ...returnForm, amount: event.target.value })}
              required
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}

function ShippingAddress({ json }: { json: string }) {
  let value: Record<string, unknown> | null = null;
  try {
    value = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return <p className="text-[11.5px] leading-relaxed text-muted">{json}</p>;
  }
  const lines = [
    value.line1,
    value.line2,
    [value.city, value.state, value.postalCode].filter(Boolean).join(", "),
    value.country,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  if (lines.length === 0) return <p className="text-[11.5px] text-muted">No shipping address was supplied.</p>;
  return (
    <address className="not-italic text-[11.5px] leading-relaxed text-ink-soft">
      {lines.map((line, index) => (
        <span key={`${line}-${index}`} className="block">
          {line}
        </span>
      ))}
    </address>
  );
}

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    created: "Order created",
    confirmed: "Order confirmed",
    processing: "Processing started",
    shipped: "Shipment dispatched",
    delivered: "Order delivered",
    cancelled: "Order cancelled",
    "return.requested": "Return requested",
    "return.approved": "Return approved",
    "return.rejected": "Return rejected",
  };
  return labels[type] ?? type.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function eventIcon(type: string): "orders" | "check" | "truck" | "wallet" | "refresh" | "close" {
  if (type === "confirmed") return "check";
  if (type === "shipped" || type === "delivered") return "truck";
  if (type.startsWith("return")) return "refresh";
  if (type === "cancelled") return "close";
  if (type === "created") return "orders";
  return "orders";
}
