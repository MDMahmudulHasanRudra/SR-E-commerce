"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { ProductDetail } from "@/lib/types";
import { currency, number } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmModal,
  ErrorState,
  InfoRow,
  PageHeader,
  Skeleton,
  StatusBadge,
  TD,
  TH,
  THead,
  TR,
  Table,
  useToast,
} from "@/components/ui";
import { ProgressBar } from "@/components/charts";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<ProductDetail>(`/api/v1/products/${params.id}`);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      await api(`/api/v1/products/${params.id}`, { method: "DELETE" });
      push({ title: "Product archived", description: "It is removed from active catalog views." });
      router.push("/products");
    } catch (cause) {
      push({
        tone: "error",
        title: "Could not archive product",
        description: cause instanceof Error ? cause.message : "Try again.",
      });
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-[360px] rounded-xl" />
          <Skeleton className="h-[360px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <ErrorState message={error?.message ?? "Product not found."} onRetry={reload} />
      </Card>
    );
  }

  const margin =
    data.basePrice > 0 ? ((data.basePrice - data.costPrice) / data.basePrice) * 100 : 0;
  const available = data.totalOnHand - data.totalReserved;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/products"
          className="mb-3 inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-ink"
        >
          <Icon name="chevronLeft" size={13} /> Back to products
        </Link>
        <PageHeader
          eyebrow="Product"
          title={data.name}
          description={`${data.sku} · ${data.categoryName ?? "Uncategorized"}`}
        >
          <StatusBadge status={data.status} />
          {data.isFeatured && <Badge tone="amber">Featured</Badge>}
          <Link href={`/products/${data.id}/edit`}>
            <Button variant="secondary" icon="edit">
              Edit
            </Button>
          </Link>
          <Button variant="danger" icon="trash" onClick={() => setConfirmOpen(true)}>
            Archive
          </Button>
        </PageHeader>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardBody className="flex flex-col gap-5 sm:flex-row">
              <div className="flex h-32 w-full shrink-0 items-center justify-center rounded-xl border border-dashed border-line-strong bg-[#faf9f5] text-[#a3a79a] sm:w-32">
                <Icon name="box" size={34} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Description</p>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                  {data.description || data.shortDescription || "No description has been added yet."}
                </p>
                {data.tags && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {data.tags.split(",").map((tag) => (
                      <Badge key={tag} tone="zinc">
                        {tag.trim()}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Variants"
              description={`${data.variants.length} variant(s) · ${number(data.totalOnHand)} on hand`}
              action={
                <Link href={`/inventory?search=${encodeURIComponent(data.sku)}`}>
                  <Button variant="secondary" size="sm" icon="warehouse">
                    Manage stock
                  </Button>
                </Link>
              }
            />
            <Table className="min-w-[560px]">
              <THead>
                <tr>
                  <TH>Variant</TH>
                  <TH>SKU</TH>
                  <TH align="right">Price</TH>
                  <TH align="right">Cost</TH>
                  <TH align="right">On hand</TH>
                  <TH>State</TH>
                </tr>
              </THead>
              <tbody>
                {data.variants.map((variant) => (
                  <TR key={variant.id}>
                    <TD>
                      <p className="text-[12.5px] font-medium">{variant.name}</p>
                      {variant.isDefault && (
                        <p className="mt-0.5 text-[10px] text-muted">Default variant</p>
                      )}
                    </TD>
                    <TD className="font-mono text-[10.5px] text-muted">{variant.sku}</TD>
                    <TD align="right" className="num text-[12px]">
                      {currency(variant.price, data.currencyCode)}
                    </TD>
                    <TD align="right" className="num text-[12px] text-muted">
                      {currency(variant.costPrice, data.currencyCode)}
                    </TD>
                    <TD align="right" className="num text-[12px]">
                      {number(variant.onHand)}
                      <span className="text-muted"> · {number(variant.reserved)} held</span>
                    </TD>
                    <TD>
                      <Badge tone={variant.isActive ? "emerald" : "zinc"} dot>
                        {variant.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader
              title="Media"
              description={`${data.images.length} image URL(s)`}
              action={<Badge tone="zinc">Optional</Badge>}
            />
            {data.images.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-5 text-[12px] text-muted">
                <Icon name="sparkle" size={15} />
                No images attached. Add image URLs when editing this product.
              </div>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                {data.images.map((image) => (
                  <div
                    key={image}
                    className="flex h-28 items-center justify-center overflow-hidden rounded-lg border border-line bg-[#faf9f5] text-[10px] text-muted"
                  >
                    <span className="line-clamp-2 break-all px-2">{image}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Pricing" action={<Badge tone="brand">{data.currencyCode}</Badge>} />
            <CardBody className="divide-y divide-[#efede5] py-0">
              <InfoRow label="Base price" value={currency(data.basePrice, data.currencyCode)} />
              <InfoRow label="Cost price" value={currency(data.costPrice, data.currencyCode)} />
              <InfoRow
                label="Compare-at"
                value={data.compareAtPrice ? currency(data.compareAtPrice, data.currencyCode) : "—"}
              />
              <InfoRow label="Tax rate" value={`${data.taxRate}%`} />
              <InfoRow label="Gross margin" value={`${margin.toFixed(1)}%`} />
            </CardBody>
            <div className="px-5 pb-4 pt-2">
              <ProgressBar value={Math.max(0, margin)} max={100} tone={margin > 25 ? "brand" : "amber"} />
              <p className="mt-1.5 text-[10px] text-muted">Margin at base price, before discounts and tax.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Inventory" />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[#faf9f5] px-2 py-3">
                  <p className="num text-lg font-semibold">{number(data.totalOnHand)}</p>
                  <p className="mt-0.5 text-[10px] text-muted">On hand</p>
                </div>
                <div className="rounded-lg bg-[#faf9f5] px-2 py-3">
                  <p className="num text-lg font-semibold">{number(data.totalReserved)}</p>
                  <p className="mt-0.5 text-[10px] text-muted">Reserved</p>
                </div>
                <div className="rounded-lg bg-brand-soft px-2 py-3">
                  <p className="num text-lg font-semibold text-brand">{number(available)}</p>
                  <p className="mt-0.5 text-[10px] text-brand/70">Available</p>
                </div>
              </div>
              <p className="rounded-lg border border-dashed border-line-strong px-3 py-2 text-[10.5px] leading-relaxed text-muted">
                Stock is held per warehouse. Movements are immutable and recorded against variants.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Organization" />
            <CardBody className="divide-y divide-[#efede5] py-0">
              <InfoRow label="Category" value={data.categoryName ?? "Uncategorized"} />
              <InfoRow label="Brand" value={data.brandName ?? "No brand"} />
              <InfoRow label="Slug" value={<span className="font-mono text-[11px]">{data.slug}</span>} />
              <InfoRow
                label="Featured"
                value={<Badge tone={data.isFeatured ? "amber" : "zinc"}>{data.isFeatured ? "Yes" : "No"}</Badge>}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="SEO" />
            <CardBody className="space-y-2">
              <p className="text-[11px] font-medium text-ink-soft">{data.seoTitle ?? data.name}</p>
              <p className="text-[11px] leading-relaxed text-muted">
                {data.seoDescription ?? "No SEO description set."}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={remove}
        title="Archive this product?"
        description="The product will be removed from active catalog and integration responses. Order history is preserved."
        confirmLabel="Archive product"
        loading={deleting}
      />
    </div>
  );
}
