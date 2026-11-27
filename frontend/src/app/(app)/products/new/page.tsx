"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Brand, Category, ProductDetail } from "@/lib/types";
import { ProductForm, type ProductPayload } from "@/components/ProductForm";
import { Button, PageHeader, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";

export default function NewProductPage() {
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = useApi<Category[]>("/api/v1/categories");
  const brands = useApi<Brand[]>("/api/v1/brands");

  async function submit(payload: ProductPayload) {
    setBusy(true);
    setError(null);
    try {
      const created = await api<ProductDetail>("/api/v1/products", { method: "POST", body: payload });
      push({ title: "Product created", description: `${created.name} is ready for stock and pricing.` });
      router.push(`/products/${created.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the product.");
    } finally {
      setBusy(false);
    }
  }

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
          eyebrow="Catalog"
          title="New product"
          description="Create the product record first. Variants are generated automatically and can be refined later."
        >
          <Button variant="secondary" onClick={() => router.push("/products")} disabled={busy}>
            Discard
          </Button>
        </PageHeader>
      </div>

      <ProductForm
        categories={categories.data ?? []}
        brands={brands.data ?? []}
        onSubmit={submit}
        onCancel={() => router.push("/products")}
        busy={busy}
        error={error}
      />
    </div>
  );
}
