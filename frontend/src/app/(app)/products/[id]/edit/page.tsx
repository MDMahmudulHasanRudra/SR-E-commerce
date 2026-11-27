"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Brand, Category, ProductDetail } from "@/lib/types";
import { ProductForm, type ProductPayload } from "@/components/ProductForm";
import { Button, ErrorState, PageHeader, Skeleton, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const product = useApi<ProductDetail>(`/api/v1/products/${params.id}`);
  const categories = useApi<Category[]>("/api/v1/categories");
  const brands = useApi<Brand[]>("/api/v1/brands");

  async function submit(payload: ProductPayload) {
    setBusy(true);
    setError(null);
    try {
      await api<ProductDetail>(`/api/v1/products/${params.id}`, { method: "PUT", body: payload });
      push({ title: "Product updated" });
      router.push(`/products/${params.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/products/${params.id}`}
          className="mb-3 inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-ink"
        >
          <Icon name="chevronLeft" size={13} /> Back to product
        </Link>
        <PageHeader
          eyebrow="Catalog"
          title="Edit product"
          description={product.data ? `Updating ${product.data.name} · ${product.data.sku}` : "Loading product…"}
        >
          <Button variant="secondary" onClick={() => router.push(`/products/${params.id}`)} disabled={busy}>
            Discard
          </Button>
        </PageHeader>
      </div>

      {product.loading && <Skeleton className="h-[520px] rounded-xl" />}
      {!product.loading && (product.error || !product.data) && (
        <div className="rounded-xl border border-line bg-surface">
          <ErrorState message={product.error?.message ?? "Product not found."} onRetry={product.reload} />
        </div>
      )}
      {product.data && (
        <ProductForm
          initial={product.data}
          categories={categories.data ?? []}
          brands={brands.data ?? []}
          onSubmit={submit}
          onCancel={() => router.push(`/products/${params.id}`)}
          busy={busy}
          error={error}
        />
      )}
    </div>
  );
}
