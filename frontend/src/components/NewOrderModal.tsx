"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Paged } from "@/lib/api";
import { errorMessage, useApi } from "@/lib/hooks";
import type { CustomerDetail, CustomerListItem, OrderDetail, PriceQuoteResponse, StockRow } from "@/lib/types";
import { currency } from "@/lib/format";
import { Icon } from "@/components/icons";
import { useAuth } from "@/components/AuthProvider";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  cn,
  useToast,
} from "@/components/ui";

type Line = { key: number; variantId: string; quantity: string };

let lineKey = 1;

export function NewOrderModal({
  open,
  onClose,
  onCreated,
  initialCustomerId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (order: OrderDetail) => void;
  initialCustomerId?: string | null;
}) {
  const { push } = useToast();
  const { session } = useAuth();
  const [mode, setMode] = useState<"existing" | "guest">("existing");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: lineKey, variantId: "", quantity: "1" }]);
  const [couponCode, setCouponCode] = useState("");
  const [shipping, setShipping] = useState("0");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("standalone");
  const [externalOrderId, setExternalOrderId] = useState("");
  const [addressMode, setAddressMode] = useState<"default" | "saved" | "custom">("default");
  const [savedAddressId, setSavedAddressId] = useState("");
  const [addrForm, setAddrForm] = useState({ line1: "", line2: "", city: "", state: "", postalCode: "", country: "" });
  const [quoteSummary, setQuoteSummary] = useState<{
    subtotal: number;
    offerDiscount: number;
    couponDiscount: number;
    appliedOffers: string[];
  } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customers = useApi<Paged<CustomerListItem>>(open ? "/api/v1/customers?pageSize=200" : null);
  const selectedCustomer = useApi<CustomerDetail>(
    open && mode === "existing" && customerId ? `/api/v1/customers/${customerId}` : null,
  );
  const stock = useApi<Paged<StockRow>>(open ? "/api/v1/inventory/stock?pageSize=200" : null);

  const variants = useMemo(() => {
    const map = new Map<string, StockRow>();
    (stock.data?.items ?? []).forEach((row) => {
      if (!map.has(row.variantId)) map.set(row.variantId, row);
    });
    return [...map.values()];
  }, [stock.data]);

  useEffect(() => {
    if (!open) return;
    setMode("existing");
    setCustomerId(initialCustomerId ?? "");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setLines([{ key: (lineKey += 1), variantId: "", quantity: "1" }]);
    setCouponCode("");
    setShipping("0");
    setNotes("");
    setSource("standalone");
    setExternalOrderId("");
    setAddressMode("default");
    setSavedAddressId("");
    setAddrForm({ line1: "", line2: "", city: "", state: "", postalCode: "", country: "" });
    setQuoteSummary(null);
    setError(null);
  }, [open, initialCustomerId]);

  const currencyCode = session?.user.currencyCode ?? "USD";
  const subtotal = lines.reduce((sum, line) => {
    const variant = variants.find((item) => item.variantId === line.variantId);
    return sum + (variant?.price ?? 0) * (Number(line.quantity) || 0);
  }, 0);
  const netItemsEstimate = quoteSummary
    ? Math.max(0, quoteSummary.subtotal - quoteSummary.offerDiscount - quoteSummary.couponDiscount)
    : subtotal;
  const grandEstimate = netItemsEstimate + (Number(shipping) || 0);

  async function previewServerQuote() {
    const validLines = lines.filter((line) => line.variantId && Number(line.quantity) > 0);
    if (validLines.length === 0) {
      push({ tone: "error", title: "Add at least one product line first" });
      return;
    }
    setQuoting(true);
    setError(null);
    try {
      const results = await Promise.all(
        validLines.map((line) =>
          api<PriceQuoteResponse>("/api/v1/pricing/quote", {
            method: "POST",
            body: {
              variantId: line.variantId,
              quantity: Math.max(1, Math.floor(Number(line.quantity))),
              couponCode: couponCode.trim() || null,
            },
          }),
        ),
      );
      let gross = 0;
      let offerDisc = 0;
      const offerNames = new Set<string>();
      validLines.forEach((line, idx) => {
        const qty = Math.max(1, Math.floor(Number(line.quantity)));
        const q = results[idx].quote;
        gross += q.listPrice * qty;
        offerDisc += q.offerDiscount * qty;
        if (q.offerName) offerNames.add(q.offerName);
      });
      const couponDisc = results.find((r) => r.coupon)?.coupon?.discountAmount ?? 0;
      setQuoteSummary({
        subtotal: gross,
        offerDiscount: offerDisc,
        couponDiscount: couponDisc,
        appliedOffers: [...offerNames],
      });
    } catch (cause) {
      setQuoteSummary(null);
      setError(errorMessage(cause));
    } finally {
      setQuoting(false);
    }
  }

  function buildShippingAddressJson(): string | null {
    if (mode === "existing" && addressMode === "default") return null;
    if (mode === "existing" && addressMode === "saved") {
      const addr = selectedCustomer.data?.addresses.find((a) => a.id === savedAddressId);
      if (!addr) return null;
      return JSON.stringify({
        line1: addr.line1,
        line2: addr.line2,
        city: addr.city,
        state: addr.state,
        postalCode: addr.postalCode,
        country: addr.country,
      });
    }
    if (addrForm.line1.trim() || addrForm.city.trim()) {
      return JSON.stringify({
        line1: addrForm.line1.trim(),
        line2: addrForm.line2.trim() || null,
        city: addrForm.city.trim(),
        state: addrForm.state.trim() || null,
        postalCode: addrForm.postalCode.trim() || null,
        country: addrForm.country.trim(),
      });
    }
    return null;
  }

  async function submit() {
    setError(null);
    const items = lines
      .filter((line) => line.variantId && Number(line.quantity) > 0)
      .map((line) => ({ variantId: line.variantId, quantity: Number(line.quantity) }));
    if (items.length === 0) {
      setError("Add at least one product line with a positive quantity.");
      return;
    }
    if (mode === "existing" && !customerId) {
      setError("Choose a customer or switch to a guest checkout.");
      return;
    }
    if (mode === "guest" && !customerName.trim()) {
      setError("A customer name is required for guest orders.");
      return;
    }
    setBusy(true);
    try {
      const order = await api<OrderDetail>("/api/v1/orders", {
        method: "POST",
        body: {
          customerId: mode === "existing" ? customerId : null,
          customerName: mode === "guest" ? customerName.trim() : null,
          customerEmail: mode === "guest" ? customerEmail.trim() || null : null,
          customerPhone: mode === "guest" ? customerPhone.trim() || null : null,
          items,
          couponCode: couponCode.trim() || null,
          shippingTotal: Number(shipping) || 0,
          shippingAddressJson: buildShippingAddressJson(),
          notes: notes.trim() || null,
          source: source.trim() || "standalone",
          externalOrderId: externalOrderId.trim() || null,
        },
      });
      push({ title: "Order created", description: `${order.orderNumber} is pending confirmation.` });
      onCreated(order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the order.");
    } finally {
      setBusy(false);
    }
  }

  const savedAddresses = selectedCustomer.data?.addresses ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New order"
      description="Prices and totals are re-calculated by the server, including live offers and tax."
      size="xl"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="secondary" size="sm" icon="sparkle" loading={quoting} onClick={() => void previewServerQuote()}>
            Verify server quote
          </Button>
          <Button variant="primary" size="sm" onClick={submit} loading={busy}>
            Create order · {currency(grandEstimate, currencyCode)}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">{error}</p>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">Customer</p>
            <div className="flex rounded-lg border border-line bg-[#f3f1ea] p-0.5">
              {(["existing", "guest"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[10.5px] font-medium capitalize transition-colors",
                    mode === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink-soft",
                  )}
                >
                  {value === "existing" ? "Existing" : "Guest"}
                </button>
              ))}
            </div>
          </div>
          {mode === "existing" ? (
            <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Select a customer…</option>
              {(customers.data?.items ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.displayName}
                  {customer.email ? ` · ${customer.email}` : ""}
                </option>
              ))}
            </Select>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Full name" required>
                <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Jane Cooper" />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  placeholder="jane@example.com"
                />
              </Field>
              <Field label="Phone">
                <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="+1…" />
              </Field>
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">Items</p>
            <button
              type="button"
              onClick={() => {
                setQuoteSummary(null);
                setLines((current) => [...current, { key: (lineKey += 1), variantId: "", quantity: "1" }]);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
            >
              <Icon name="plus" size={12} /> Add line
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => {
              const variant = variants.find((item) => item.variantId === line.variantId);
              return (
                <div key={line.key} className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-[#faf9f5] p-2.5 sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">
                      Product · variant
                    </label>
                    <Select
                      value={line.variantId}
                      onChange={(event) => {
                        setQuoteSummary(null);
                        setLines((current) =>
                          current.map((item) =>
                            item.key === line.key ? { ...item, variantId: event.target.value } : item,
                          ),
                        );
                      }}
                    >
                      <option value="">Select a variant…</option>
                      {variants.map((item) => (
                        <option key={item.variantId} value={item.variantId}>
                          {item.productName} · {item.variantName} ({item.sku})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-[88px]">
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">
                      Qty
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      onChange={(event) => {
                        setQuoteSummary(null);
                        setLines((current) =>
                          current.map((item) =>
                            item.key === line.key ? { ...item, quantity: event.target.value } : item,
                          ),
                        );
                      }}
                    />
                  </div>
                  <div className="w-[88px] pb-2.5 text-right">
                    <p className="num text-[11.5px] font-medium">
                      {currency((variant?.price ?? 0) * (Number(line.quantity) || 0), currencyCode)}
                    </p>
                    <p className="mt-0.5 text-[9.5px] text-muted">{variant ? `${variant.available} available` : "—"}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove line"
                    disabled={lines.length === 1}
                    onClick={() => {
                      setQuoteSummary(null);
                      setLines((current) => current.filter((item) => item.key !== line.key));
                    }}
                    className="mb-1 flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                  <span className="sr-only">Line {index + 1}</span>
                </div>
              );
            })}
          </div>
          {variants.length === 0 && !stock.loading && (
            <p className="mt-2 text-[11px] text-muted">
              No stock records found. Add a product and opening stock before creating an order.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-[#faf9f5] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">Shipping address</p>
            {mode === "existing" && (
              <div className="flex rounded-lg border border-line bg-surface p-0.5">
                {(
                  [
                    { id: "default", label: "Customer default" },
                    ...(savedAddresses.length > 0 ? [{ id: "saved", label: "Saved" }] : []),
                    { id: "custom", label: "Custom" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAddressMode(opt.id as "default" | "saved" | "custom")}
                    className={cn(
                      "rounded-md px-2 py-1 text-[10.5px] font-medium transition-colors",
                      addressMode === opt.id ? "bg-[#f0eee6] text-ink" : "text-muted hover:text-ink-soft",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {mode === "existing" && addressMode === "default" && (
            <p className="text-[11px] text-muted">
              Uses the customer&apos;s default shipping address on file (if present).
            </p>
          )}
          {mode === "existing" && addressMode === "saved" && (
            <Select value={savedAddressId} onChange={(event) => setSavedAddressId(event.target.value)}>
              <option value="">Choose saved address…</option>
              {savedAddresses.map((addr) => (
                <option key={addr.id} value={addr.id}>
                  [{addr.type}] {addr.line1}, {addr.city}, {addr.country}
                </option>
              ))}
            </Select>
          )}
          {(mode === "guest" || addressMode === "custom") && (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Input
                value={addrForm.line1}
                onChange={(event) => setAddrForm({ ...addrForm, line1: event.target.value })}
                placeholder="Street address line 1"
              />
              <Input
                value={addrForm.city}
                onChange={(event) => setAddrForm({ ...addrForm, city: event.target.value })}
                placeholder="City"
              />
              <Input
                value={addrForm.state}
                onChange={(event) => setAddrForm({ ...addrForm, state: event.target.value })}
                placeholder="State / region"
              />
              <Input
                value={addrForm.country}
                onChange={(event) => setAddrForm({ ...addrForm, country: event.target.value })}
                placeholder="Country"
              />
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Coupon code" hint="Validated server-side.">
            <Input
              value={couponCode}
              onChange={(event) => {
                setQuoteSummary(null);
                setCouponCode(event.target.value.toUpperCase());
              }}
              placeholder="WELCOME10"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Shipping total">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={shipping}
              onChange={(event) => setShipping(event.target.value)}
            />
          </Field>
          <div className="rounded-lg border border-line bg-[#faf9f5] px-3 py-2 text-[11px]">
            <div className="flex justify-between text-muted">
              <span>Items</span>
              <span className="num">{currency(quoteSummary?.subtotal ?? subtotal, currencyCode)}</span>
            </div>
            {quoteSummary && quoteSummary.offerDiscount > 0 && (
              <div className="mt-1 flex justify-between text-emerald-700">
                <span>Offers</span>
                <span className="num">−{currency(quoteSummary.offerDiscount, currencyCode)}</span>
              </div>
            )}
            {quoteSummary && quoteSummary.couponDiscount > 0 && (
              <div className="mt-1 flex justify-between text-violet-700">
                <span>Coupon</span>
                <span className="num">−{currency(quoteSummary.couponDiscount, currencyCode)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between text-muted">
              <span>Shipping</span>
              <span className="num">{currency(Number(shipping) || 0, currencyCode)}</span>
            </div>
            <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 font-medium text-ink">
              <span>{quoteSummary ? "Quoted" : "Estimate"}</span>
              <span className="num">{currency(grandEstimate, currencyCode)}</span>
            </div>
            {quoteSummary && quoteSummary.appliedOffers.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {quoteSummary.appliedOffers.map((offer) => (
                  <Badge key={offer} tone="emerald">
                    {offer}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Order source">
            <Select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="standalone">Standalone</option>
              <option value="get-assist">Get Assist</option>
              <option value="pos">Point of sale</option>
              <option value="phone">Phone / Manual</option>
            </Select>
          </Field>
          <Field label="External order ID" hint="Optional reference from host or channel.">
            <Input
              value={externalOrderId}
              onChange={(event) => setExternalOrderId(event.target.value)}
              placeholder="EXT-1042"
              className="font-mono text-xs"
            />
          </Field>
        </div>

        <Field label="Internal notes">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Delivery instructions, packing notes…"
            className="min-h-[68px]"
          />
        </Field>
        <p className="flex items-center gap-1.5 text-[10.5px] text-muted">
          <Icon name="shield" size={11} /> The server reserves stock immediately and writes an audit event.
        </p>
      </div>
    </Modal>
  );
}
