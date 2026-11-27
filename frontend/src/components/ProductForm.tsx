"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Switch, Textarea } from "./ui";
import type { Brand, Category, ProductDetail } from "@/lib/types";

export type ProductPayload = {
  name: string;
  sku: string | null;
  shortDescription: string | null;
  description: string | null;
  categoryId: string | null;
  brandId: string | null;
  status: string;
  costPrice: number;
  basePrice: number;
  compareAtPrice: number | null;
  taxRate: number;
  isFeatured: boolean;
  tags: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  variants?: {
    id: string | null;
    name: string;
    sku: string;
    attributesJson: string | null;
    costPrice: number;
    price: number;
    isActive: boolean;
    isDefault: boolean;
  }[];
  images: string[];
};

export function ProductForm({
  initial,
  categories,
  brands,
  onSubmit,
  onCancel,
  busy,
  error,
}: {
  initial?: ProductDetail | null;
  categories: Category[];
  brands: Brand[];
  onSubmit: (payload: ProductPayload) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [shortDescription, setShortDescription] = useState(initial?.shortDescription ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [brandId, setBrandId] = useState(initial?.brandId ?? "");
  const [status, setStatus] = useState(initial?.status ?? "Draft");
  const [costPrice, setCostPrice] = useState(String(initial?.costPrice ?? 0));
  const [basePrice, setBasePrice] = useState(String(initial?.basePrice ?? 0));
  const [compareAtPrice, setCompareAtPrice] = useState(
    initial?.compareAtPrice !== null && initial?.compareAtPrice !== undefined ? String(initial.compareAtPrice) : "",
  );
  const [taxRate, setTaxRate] = useState(String(initial?.taxRate ?? 0));
  const [isFeatured, setIsFeatured] = useState(initial?.isFeatured ?? false);
  const [tags, setTags] = useState(initial?.tags ?? "");
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [images, setImages] = useState((initial?.images ?? []).join("\n"));
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!name.trim()) {
      setLocalError("Product name is required.");
      return;
    }
    if (Number(basePrice) < 0 || Number(costPrice) < 0) {
      setLocalError("Prices cannot be negative.");
      return;
    }
    await onSubmit({
      name: name.trim(),
      sku: sku.trim() || null,
      shortDescription: shortDescription.trim() || null,
      description: description.trim() || null,
      categoryId: categoryId || null,
      brandId: brandId || null,
      status,
      costPrice: Number(costPrice) || 0,
      basePrice: Number(basePrice) || 0,
      compareAtPrice: compareAtPrice.trim() === "" ? null : Number(compareAtPrice),
      taxRate: Number(taxRate) || 0,
      isFeatured,
      tags: tags.trim() || null,
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
      variants: initial?.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        attributesJson: variant.attributesJson ?? null,
        costPrice: variant.costPrice,
        price: variant.price,
        isActive: variant.isActive,
        isDefault: variant.isDefault,
      })),
      images: images
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="Product details" description="The name customers and your team will see." />
          <CardBody className="space-y-4">
            <Field label="Product name" required>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. iPhone 16 128GB"
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SKU" hint="Leave blank to generate automatically.">
                <Input
                  value={sku}
                  onChange={(event) => setSku(event.target.value.toUpperCase())}
                  placeholder="APL-IP16"
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Status">
                <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Archived">Archived</option>
                </Select>
              </Field>
            </div>
            <Field label="Short description" hint="Used in listings and integration responses.">
              <Input
                value={shortDescription}
                onChange={(event) => setShortDescription(event.target.value)}
                placeholder="One line that sells the product"
              />
            </Field>
            <Field label="Full description">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Materials, dimensions, what is in the box…"
                className="min-h-[120px]"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pricing" description="Money is stored as decimals; the server owns effective pricing." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Base price" required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={basePrice}
                  onChange={(event) => setBasePrice(event.target.value)}
                />
              </Field>
              <Field label="Cost price">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costPrice}
                  onChange={(event) => setCostPrice(event.target.value)}
                />
              </Field>
              <Field label="Compare-at price">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={compareAtPrice}
                  onChange={(event) => setCompareAtPrice(event.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tax rate (%)" hint="Applied per unit when an order is placed.">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxRate}
                  onChange={(event) => setTaxRate(event.target.value)}
                />
              </Field>
              <div className="flex items-end pb-1">
                <Switch
                  checked={isFeatured}
                  onChange={setIsFeatured}
                  label="Featured product"
                  description="Highlight this item in your storefront and integrations."
                />
              </div>
            </div>
            {Number(basePrice) > 0 && Number(costPrice) > 0 && (
              <p className="rounded-lg bg-[#faf9f5] px-3 py-2 text-[11px] text-muted">
                Gross margin at base price:{" "}
                <span className="num font-medium text-ink-soft">
                  {(((Number(basePrice) - Number(costPrice)) / Number(basePrice)) * 100).toFixed(1)}%
                </span>
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Media & SEO" description="Optional. One image URL per line." />
          <CardBody className="space-y-4">
            <Field label="Image URLs">
              <Textarea
                value={images}
                onChange={(event) => setImages(event.target.value)}
                placeholder="https://cdn.example.com/product-front.jpg"
                className="min-h-[80px] font-mono text-xs"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SEO title">
                <Input value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} />
              </Field>
              <Field label="Tags" hint="Comma separated.">
                <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="demo, new" />
              </Field>
            </div>
            <Field label="SEO description">
              <Textarea value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} />
            </Field>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Organization" />
          <CardBody className="space-y-4">
            <Field label="Category">
              <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Uncategorized</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Brand">
              <Select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                <option value="">No brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="rounded-lg border border-dashed border-line-strong bg-[#faf9f5] p-3 text-[11px] leading-relaxed text-muted">
              Stock is tracked per variant and per warehouse. Add opening stock from the Inventory page after
              creating the product.
            </div>
          </CardBody>
        </Card>

        {initial && (
          <Card>
            <CardHeader title="Variants" description={`${initial.variants.length} variant(s)`} />
            <div className="divide-y divide-[#efede5]">
              {initial.variants.map((variant) => (
                <div key={variant.id} className="flex items-center justify-between gap-3 px-5 py-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{variant.name}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted">{variant.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="num font-medium">{variant.price.toFixed(2)}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {variant.onHand} on hand
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <CardBody className="space-y-3">
            {(localError || error) && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-700">
                {localError ?? error}
              </p>
            )}
            <Button type="submit" variant="primary" className="w-full" loading={busy}>
              {initial ? "Save changes" : "Create product"}
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </CardBody>
        </Card>
      </div>
    </form>
  );
}
