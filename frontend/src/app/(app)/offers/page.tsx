"use client";

import { useState } from "react";
import { api, type Paged } from "@/lib/api";
import { errorMessage, useApi } from "@/lib/hooks";
import type { Category, Coupon, Offer, OfferBundle, ProductListItem } from "@/lib/types";
import { currency, date, number, percent } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableSkeleton,
  Tabs,
  useToast,
} from "@/components/ui";

type OfferForm = {
  name: string;
  type: string;
  value: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  appliesToAllProducts: boolean;
  productId: string;
  categoryId: string;
  minQuantity: string;
};

type CouponForm = {
  code: string;
  type: string;
  value: string;
  minOrderSubtotal: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  maxRedemptions: string;
};

const toLocalInput = (iso: string) => {
  const value = new Date(iso);
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60000).toISOString().slice(0, 16);
};

const defaultStart = () => toLocalInput(new Date().toISOString());
const defaultEnd = () => toLocalInput(new Date(Date.now() + 30 * 86400000).toISOString());

const emptyOffer = (): OfferForm => ({
  name: "",
  type: "Percentage",
  value: "10",
  startsAt: defaultStart(),
  endsAt: defaultEnd(),
  isActive: true,
  appliesToAllProducts: true,
  productId: "",
  categoryId: "",
  minQuantity: "1",
});

const emptyCoupon = (): CouponForm => ({
  code: "",
  type: "Percentage",
  value: "10",
  minOrderSubtotal: "0",
  startsAt: defaultStart(),
  endsAt: defaultEnd(),
  isActive: true,
  maxRedemptions: "",
});

export default function OffersPage() {
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<OfferBundle>("/api/v1/pricing/offers");
  const products = useApi<Paged<ProductListItem>>("/api/v1/products?pageSize=200");
  const categories = useApi<Category[]>("/api/v1/categories");
  const [tab, setTab] = useState("offers");

  const [offerOpen, setOfferOpen] = useState(false);
  const [offerEditing, setOfferEditing] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState<OfferForm>(emptyOffer);
  const [offerBusy, setOfferBusy] = useState(false);

  const [couponOpen, setCouponOpen] = useState(false);
  const [couponEditing, setCouponEditing] = useState<string | null>(null);
  const [couponForm, setCouponForm] = useState<CouponForm>(emptyCoupon);
  const [couponBusy, setCouponBusy] = useState(false);

  const [deleting, setDeleting] = useState<{ kind: "offer" | "coupon"; id: string; name: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function openOffer(offer?: Offer) {
    if (offer) {
      setOfferEditing(offer.id);
      setOfferForm({
        name: offer.name,
        type: offer.type,
        value: String(offer.value),
        startsAt: toLocalInput(offer.startsAtUtc),
        endsAt: toLocalInput(offer.endsAtUtc),
        isActive: offer.isActive,
        appliesToAllProducts: offer.appliesToAllProducts,
        productId: offer.productId ?? "",
        categoryId: offer.categoryId ?? "",
        minQuantity: String(offer.minQuantity),
      });
    } else {
      setOfferEditing(null);
      setOfferForm(emptyOffer());
    }
    setOfferOpen(true);
  }

  function openCoupon(coupon?: Coupon) {
    if (coupon) {
      setCouponEditing(coupon.id);
      setCouponForm({
        code: coupon.code,
        type: coupon.type,
        value: String(coupon.value),
        minOrderSubtotal: String(coupon.minOrderSubtotal),
        startsAt: toLocalInput(coupon.startsAtUtc),
        endsAt: toLocalInput(coupon.endsAtUtc),
        isActive: coupon.isActive,
        maxRedemptions: coupon.maxRedemptions === null || coupon.maxRedemptions === undefined ? "" : String(coupon.maxRedemptions),
      });
    } else {
      setCouponEditing(null);
      setCouponForm(emptyCoupon());
    }
    setCouponOpen(true);
  }

  async function saveOffer() {
    if (!offerForm.name.trim()) {
      push({ tone: "error", title: "Offer name is required" });
      return;
    }
    const value = Number(offerForm.value);
    if (!Number.isFinite(value) || value <= 0) {
      push({ tone: "error", title: "Enter a discount value greater than zero" });
      return;
    }
    if (new Date(offerForm.endsAt) <= new Date(offerForm.startsAt)) {
      push({ tone: "error", title: "The end date must be after the start date" });
      return;
    }
    setOfferBusy(true);
    try {
      await api(offerEditing ? `/api/v1/pricing/offers/${offerEditing}` : "/api/v1/pricing/offers", {
        method: offerEditing ? "PUT" : "POST",
        body: {
          name: offerForm.name.trim(),
          type: offerForm.type,
          value,
          startsAtUtc: new Date(offerForm.startsAt).toISOString(),
          endsAtUtc: new Date(offerForm.endsAt).toISOString(),
          isActive: offerForm.isActive,
          appliesToAllProducts: offerForm.appliesToAllProducts,
          productId: offerForm.appliesToAllProducts || !offerForm.productId ? null : offerForm.productId,
          categoryId: offerForm.appliesToAllProducts || !offerForm.categoryId ? null : offerForm.categoryId,
          minQuantity: Math.max(1, Number(offerForm.minQuantity) || 1),
        },
      });
      await reload();
      push({ title: offerEditing ? "Offer updated" : "Offer created" });
      setOfferOpen(false);
    } catch (cause) {
      push({ tone: "error", title: "Could not save offer", description: errorMessage(cause) });
    } finally {
      setOfferBusy(false);
    }
  }

  async function saveCoupon() {
    if (!couponForm.code.trim()) {
      push({ tone: "error", title: "Coupon code is required" });
      return;
    }
    const value = Number(couponForm.value);
    if (!Number.isFinite(value) || value <= 0) {
      push({ tone: "error", title: "Enter a discount value greater than zero" });
      return;
    }
    if (new Date(couponForm.endsAt) <= new Date(couponForm.startsAt)) {
      push({ tone: "error", title: "The end date must be after the start date" });
      return;
    }
    setCouponBusy(true);
    try {
      await api(couponEditing ? `/api/v1/pricing/coupons/${couponEditing}` : "/api/v1/pricing/coupons", {
        method: couponEditing ? "PUT" : "POST",
        body: {
          code: couponForm.code.trim().toUpperCase(),
          type: couponForm.type,
          value,
          minOrderSubtotal: Math.max(0, Number(couponForm.minOrderSubtotal) || 0),
          startsAtUtc: new Date(couponForm.startsAt).toISOString(),
          endsAtUtc: new Date(couponForm.endsAt).toISOString(),
          isActive: couponForm.isActive,
          maxRedemptions: couponForm.maxRedemptions.trim() ? Math.max(1, Number(couponForm.maxRedemptions)) : null,
        },
      });
      await reload();
      push({ title: couponEditing ? "Coupon updated" : "Coupon created" });
      setCouponOpen(false);
    } catch (cause) {
      push({ tone: "error", title: "Could not save coupon", description: errorMessage(cause) });
    } finally {
      setCouponBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(
        deleting.kind === "offer" ? `/api/v1/pricing/offers/${deleting.id}` : `/api/v1/pricing/coupons/${deleting.id}`,
        { method: "DELETE" },
      );
      await reload();
      push({ title: `${deleting.kind === "offer" ? "Offer" : "Coupon"} deleted` });
      setDeleting(null);
    } catch (cause) {
      push({ tone: "error", title: "Could not delete", description: errorMessage(cause) });
    } finally {
      setDeleteBusy(false);
    }
  }

  const live = data?.active.length ?? 0;
  const total = data?.all.length ?? 0;
  const coupons = data?.coupons.length ?? 0;
  const redemptions = (data?.coupons ?? []).reduce((sum, coupon) => sum + coupon.redemptionCount, 0);
  const offerProducts = products.data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Offers & coupons"
        description="Offers change the effective price server-side. Coupons add an order-level discount after offers are applied."
      >
        <Button
          variant="secondary"
          icon="plus"
          onClick={() => {
            setTab("coupons");
            openCoupon();
          }}
        >
          New coupon
        </Button>
        <Button variant="primary" icon="plus" onClick={() => openOffer()}>
          New offer
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Live offers</p>
          <p className="num mt-1 text-xl font-semibold leading-none text-emerald-700">{number(live)}</p>
          <p className="mt-1 text-[10px] text-muted">Currently inside their window</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">All offers</p>
          <p className="num mt-1 text-xl font-semibold leading-none">{number(total)}</p>
          <p className="mt-1 text-[10px] text-muted">Including scheduled and inactive</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Coupons</p>
          <p className="num mt-1 text-xl font-semibold leading-none">{number(coupons)}</p>
          <p className="mt-1 text-[10px] text-muted">Order-level codes</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Redemptions</p>
          <p className="num mt-1 text-xl font-semibold leading-none">{number(redemptions)}</p>
          <p className="mt-1 text-[10px] text-muted">Across all coupons</p>
        </Card>
      </div>

      <Card>
        <div className="border-b border-line p-3.5">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "offers", label: "Offers", count: total },
              { value: "coupons", label: "Coupons", count: coupons },
            ]}
          />
        </div>

        {loading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : tab === "offers" ? (
          (data?.all.length ?? 0) === 0 ? (
            <EmptyState
              icon="tag"
              title="No offers yet"
              description="Create a percentage or fixed-amount offer for all products, a category or a single product."
              action={
                <Button variant="primary" size="sm" icon="plus" onClick={() => openOffer()}>
                  New offer
                </Button>
              }
            />
          ) : (
            <Table className="min-w-[820px]">
              <THead>
                <tr>
                  <TH>Offer</TH>
                  <TH>Discount</TH>
                  <TH>Applies to</TH>
                  <TH>Window</TH>
                  <TH align="right">Min qty</TH>
                  <TH>State</TH>
                  <TH align="right"></TH>
                </tr>
              </THead>
              <tbody>
                {(data?.all ?? []).map((offer) => (
                  <TR key={offer.id}>
                    <TD>
                      <p className="text-[12.5px] font-medium text-ink">{offer.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted">{offer.isActive ? "Enabled" : "Disabled by admin"}</p>
                    </TD>
                    <TD>
                      <Badge tone="brand">
                        {offer.type === "Percentage" ? percent(offer.value, 0) : currency(offer.value)}
                      </Badge>
                    </TD>
                    <TD className="text-[11.5px] text-ink-soft">
                      {offer.appliesToAllProducts
                        ? "All products"
                        : offer.productName ?? offer.categoryName ?? "Specific products"}
                    </TD>
                    <TD className="whitespace-nowrap text-[10.5px] text-muted">
                      {date(offer.startsAtUtc)} → {date(offer.endsAtUtc)}
                    </TD>
                    <TD align="right" className="num text-[12px]">
                      {offer.minQuantity}
                    </TD>
                    <TD>
                      <Badge tone={offer.isLive ? "emerald" : offer.isActive ? "amber" : "zinc"} dot>
                        {offer.isLive ? "Live" : offer.isActive ? "Scheduled / ended" : "Inactive"}
                      </Badge>
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" icon="edit" onClick={() => openOffer(offer)}>
                          Edit
                        </Button>
                        <button
                          type="button"
                          aria-label="Delete offer"
                          onClick={() => setDeleting({ kind: "offer", id: offer.id, name: offer.name })}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        ) : (data?.coupons.length ?? 0) === 0 ? (
          <EmptyState
            icon="receipt"
            title="No coupons yet"
            description="Coupons apply after product offers and are validated against a minimum order subtotal."
            action={
              <Button variant="primary" size="sm" icon="plus" onClick={() => openCoupon()}>
                New coupon
              </Button>
            }
          />
        ) : (
          <Table className="min-w-[820px]">
            <THead>
              <tr>
                <TH>Code</TH>
                <TH>Discount</TH>
                <TH align="right">Min subtotal</TH>
                <TH align="right">Redemptions</TH>
                <TH>Window</TH>
                <TH>State</TH>
                <TH align="right"></TH>
              </tr>
            </THead>
            <tbody>
              {(data?.coupons ?? []).map((coupon) => (
                <TR key={coupon.id}>
                  <TD>
                    <span className="rounded-md border border-line bg-[#faf9f5] px-2 py-1 font-mono text-[11px] font-medium text-ink">
                      {coupon.code}
                    </span>
                  </TD>
                  <TD>
                    <Badge tone="violet">
                      {coupon.type === "Percentage" ? percent(coupon.value, 0) : currency(coupon.value)}
                    </Badge>
                  </TD>
                  <TD align="right" className="num text-[12px]">
                    {coupon.minOrderSubtotal > 0 ? currency(coupon.minOrderSubtotal) : "None"}
                  </TD>
                  <TD align="right" className="num text-[12px]">
                    {coupon.redemptionCount}
                    {coupon.maxRedemptions ? <span className="text-muted"> / {coupon.maxRedemptions}</span> : null}
                  </TD>
                  <TD className="whitespace-nowrap text-[10.5px] text-muted">
                    {date(coupon.startsAtUtc)} → {date(coupon.endsAtUtc)}
                  </TD>
                  <TD>
                    <Badge tone={coupon.isLive ? "emerald" : coupon.isActive ? "amber" : "zinc"} dot>
                      {coupon.isLive ? "Live" : coupon.isActive ? "Scheduled / ended" : "Inactive"}
                    </Badge>
                  </TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" icon="edit" onClick={() => openCoupon(coupon)}>
                        Edit
                      </Button>
                      <button
                        type="button"
                        aria-label="Delete coupon"
                        onClick={() => setDeleting({ kind: "coupon", id: coupon.id, name: coupon.code })}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="How pricing is resolved"
          description="The client never sends a price. The server applies the best live offer, then validates the coupon."
        />
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {[
            { step: "1", title: "List price", body: "Variant list price is read from the catalog." },
            { step: "2", title: "Offer", body: "Live offers are applied server-side; the best discount wins." },
            { step: "3", title: "Coupon", body: "A valid coupon discount is applied to the order subtotal." },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-line bg-[#faf9f5] p-3.5">
              <span className="num flex h-5 w-5 items-center justify-center rounded-md bg-brand-soft text-[10px] font-semibold text-brand">
                {item.step}
              </span>
              <p className="mt-2 text-[12px] font-medium text-ink">{item.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        title={offerEditing ? "Edit offer" : "New offer"}
        description="Offers are evaluated against the current UTC time."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOfferOpen(false)} disabled={offerBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={offerBusy} onClick={() => void saveOffer()}>
              {offerEditing ? "Save changes" : "Create offer"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Offer name" required>
            <Input
              value={offerForm.name}
              onChange={(event) => setOfferForm({ ...offerForm, name: event.target.value })}
              placeholder="Spring launch 15%"
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Discount type">
              <Select
                value={offerForm.type}
                onChange={(event) => setOfferForm({ ...offerForm, type: event.target.value })}
              >
                <option value="Percentage">Percentage</option>
                <option value="FixedAmount">Fixed amount</option>
              </Select>
            </Field>
            <Field label={offerForm.type === "Percentage" ? "Percentage off" : "Amount off"} required>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={offerForm.value}
                onChange={(event) => setOfferForm({ ...offerForm, value: event.target.value })}
                required
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts" required>
              <Input
                type="datetime-local"
                value={offerForm.startsAt}
                onChange={(event) => setOfferForm({ ...offerForm, startsAt: event.target.value })}
                required
              />
            </Field>
            <Field label="Ends" required>
              <Input
                type="datetime-local"
                value={offerForm.endsAt}
                onChange={(event) => setOfferForm({ ...offerForm, endsAt: event.target.value })}
                required
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Applies to">
              <Select
                value={offerForm.appliesToAllProducts ? "all" : "specific"}
                onChange={(event) =>
                  setOfferForm({ ...offerForm, appliesToAllProducts: event.target.value === "all" })
                }
              >
                <option value="all">All products</option>
                <option value="specific">A product or category</option>
              </Select>
            </Field>
            <Field label="Minimum quantity">
              <Input
                type="number"
                min="1"
                value={offerForm.minQuantity}
                onChange={(event) => setOfferForm({ ...offerForm, minQuantity: event.target.value })}
              />
            </Field>
          </div>
          {!offerForm.appliesToAllProducts && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product">
                <Select
                  value={offerForm.productId}
                  onChange={(event) => setOfferForm({ ...offerForm, productId: event.target.value, categoryId: "" })}
                >
                  <option value="">Any product</option>
                  {offerProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {product.sku}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Category">
                <Select
                  value={offerForm.categoryId}
                  onChange={(event) => setOfferForm({ ...offerForm, categoryId: event.target.value, productId: "" })}
                >
                  <option value="">Any category</option>
                  {(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select
                value={offerForm.isActive ? "active" : "inactive"}
                onChange={(event) => setOfferForm({ ...offerForm, isActive: event.target.value === "active" })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={couponOpen}
        onClose={() => setCouponOpen(false)}
        title={couponEditing ? "Edit coupon" : "New coupon"}
        description="Coupon codes are matched case-insensitively and validated at order creation."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCouponOpen(false)} disabled={couponBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={couponBusy} onClick={() => void saveCoupon()}>
              {couponEditing ? "Save changes" : "Create coupon"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" required>
              <Input
                value={couponForm.code}
                onChange={(event) => setCouponForm({ ...couponForm, code: event.target.value.toUpperCase() })}
                placeholder="WELCOME10"
                className="font-mono"
                required
              />
            </Field>
            <Field label="Status">
              <Select
                value={couponForm.isActive ? "active" : "inactive"}
                onChange={(event) => setCouponForm({ ...couponForm, isActive: event.target.value === "active" })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Discount type">
              <Select
                value={couponForm.type}
                onChange={(event) => setCouponForm({ ...couponForm, type: event.target.value })}
              >
                <option value="Percentage">Percentage</option>
                <option value="FixedAmount">Fixed amount</option>
              </Select>
            </Field>
            <Field label={couponForm.type === "Percentage" ? "Percentage off" : "Amount off"} required>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={couponForm.value}
                onChange={(event) => setCouponForm({ ...couponForm, value: event.target.value })}
                required
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Minimum subtotal" hint="0 means no minimum.">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={couponForm.minOrderSubtotal}
                onChange={(event) => setCouponForm({ ...couponForm, minOrderSubtotal: event.target.value })}
              />
            </Field>
            <Field label="Max redemptions" hint="Leave blank for unlimited.">
              <Input
                type="number"
                min="1"
                value={couponForm.maxRedemptions}
                onChange={(event) => setCouponForm({ ...couponForm, maxRedemptions: event.target.value })}
                placeholder="Unlimited"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts" required>
              <Input
                type="datetime-local"
                value={couponForm.startsAt}
                onChange={(event) => setCouponForm({ ...couponForm, startsAt: event.target.value })}
                required
              />
            </Field>
            <Field label="Ends" required>
              <Input
                type="datetime-local"
                value={couponForm.endsAt}
                onChange={(event) => setCouponForm({ ...couponForm, endsAt: event.target.value })}
                required
              />
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title={`Delete ${deleting?.name ?? "this record"}?`}
        description="Deleted offers and coupons stop applying immediately. Existing orders keep the discount they were created with."
        confirmLabel="Delete"
        loading={deleteBusy}
      />

      <div className="flex items-center gap-2 text-[10.5px] text-muted">
        <Icon name="shield" size={11} />
        Effective prices are always computed by the server. The dashboard never submits a client-calculated total.
      </div>
    </div>
  );
}
