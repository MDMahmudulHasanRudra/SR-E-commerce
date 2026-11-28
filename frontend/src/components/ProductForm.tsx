"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "./icons";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Switch, Textarea } from "./ui";
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

type VariantDraft = {
  key: number;
  id: string | null;
  name: string;
  sku: string;
  attributesText: string;
  costPrice: string;
  price: string;
  isActive: boolean;
  isDefault: boolean;
  onHand?: number;
};

let variantDraftKey = 1;

function parseAttributesDisplay(json: string | null | undefined): string {
  if (!json) return "";
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ");
  } catch {
    return json;
  }
}

function serializeAttributes(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) return trimmed;
  const pairs = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const obj: Record<string, string> = {};
  for (const pair of pairs) {
    const idx = pair.indexOf(":");
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (k && v) obj[k] = v;
    } else {
      obj["Option"] = pair;
    }
  }
  return Object.keys(obj).length > 0 ? JSON.stringify(obj) : null;
}

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
  const [imageList, setImageList] = useState<string[]>(initial?.images ?? []);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    initial && initial.variants.length > 0
      ? initial.variants.map((v) => ({
          key: (variantDraftKey += 1),
          id: v.id,
          name: v.name,
          sku: v.sku,
          attributesText: parseAttributesDisplay(v.attributesJson),
          costPrice: String(v.costPrice),
          price: String(v.price),
          isActive: v.isActive,
          isDefault: v.isDefault,
          onHand: v.onHand,
        }))
      : [
          {
            key: (variantDraftKey += 1),
            id: null,
            name: "Default",
            sku: initial?.sku ?? "",
            attributesText: "",
            costPrice: String(initial?.costPrice ?? 0),
            price: String(initial?.basePrice ?? 0),
            isActive: true,
            isDefault: true,
          },
        ],
  );
  const [localError, setLocalError] = useState<string | null>(null);

  function addVariant() {
    const suffix = variants.length + 1;
    const baseSku = sku.trim().toUpperCase();
    setVariants((prev) => [
      ...prev,
      {
        key: (variantDraftKey += 1),
        id: null,
        name: `Variant ${suffix}`,
        sku: baseSku ? `${baseSku}-V${suffix}` : "",
        attributesText: "",
        costPrice: costPrice || "0",
        price: basePrice || "0",
        isActive: true,
        isDefault: prev.length === 0,
      },
    ]);
  }

  function setDefaultVariant(key: number) {
    setVariants((prev) => prev.map((v) => ({ ...v, isDefault: v.key === key })));
  }

  function addImage() {
    const trimmed = newImageUrl.trim();
    if (!trimmed) return;
    if (!imageList.includes(trimmed)) {
      setImageList((prev) => [...prev, trimmed]);
    }
    setNewImageUrl("");
  }

  function moveImage(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= imageList.length) return;
    setImageList((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

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
    for (const v of variants) {
      if (!v.name.trim()) {
        setLocalError("Every variant must have a name.");
        return;
      }
      if (Number(v.price) < 0 || Number(v.costPrice) < 0) {
        setLocalError("Variant prices cannot be negative.");
        return;
      }
    }

    const pendingImage = newImageUrl.trim();
    const finalImages = pendingImage && !imageList.includes(pendingImage) ? [...imageList, pendingImage] : imageList;

    const preparedVariants = variants.map((v, idx) => ({
      id: v.id,
      name: v.name.trim(),
      sku: v.sku.trim().toUpperCase(),
      attributesJson: serializeAttributes(v.attributesText),
      costPrice: Number(v.costPrice) || 0,
      price: Number(v.price) || 0,
      isActive: v.isActive,
      isDefault: v.isDefault || (idx === 0 && !variants.some((x) => x.isDefault)),
    }));

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
      variants: preparedVariants,
      images: finalImages,
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
          <CardHeader
            title="Variants & attributes"
            description="Each product has at least one variant. Variant prices drive order totals."
            action={
              <Button type="button" variant="secondary" size="sm" icon="plus" onClick={addVariant}>
                Add variant
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {variants.map((variant, idx) => (
              <div key={variant.key} className="rounded-xl border border-line bg-[#faf9f5] p-3.5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-ink">Variant {idx + 1}</span>
                    {variant.isDefault && <Badge tone="brand">Default</Badge>}
                    {variant.onHand !== undefined && (
                      <Badge tone="zinc">{variant.onHand} on hand</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!variant.isDefault && (
                      <button
                        type="button"
                        onClick={() => setDefaultVariant(variant.key)}
                        className="text-[11px] font-medium text-brand hover:underline"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={variants.length <= 1}
                      onClick={() => setVariants((prev) => prev.filter((item) => item.key !== variant.key))}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      aria-label="Remove variant"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Variant name" required>
                    <Input
                      value={variant.name}
                      onChange={(event) =>
                        setVariants((prev) =>
                          prev.map((item) =>
                            item.key === variant.key ? { ...item, name: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Default / Red · L"
                    />
                  </Field>
                  <Field label="Variant SKU">
                    <Input
                      value={variant.sku}
                      onChange={(event) =>
                        setVariants((prev) =>
                          prev.map((item) =>
                            item.key === variant.key ? { ...item, sku: event.target.value.toUpperCase() } : item,
                          ),
                        )
                      }
                      placeholder="SKU-VAR"
                      className="font-mono text-xs"
                    />
                  </Field>
                  <Field label="Selling price">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={variant.price}
                      onChange={(event) =>
                        setVariants((prev) =>
                          prev.map((item) =>
                            item.key === variant.key ? { ...item, price: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Cost price">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={variant.costPrice}
                      onChange={(event) =>
                        setVariants((prev) =>
                          prev.map((item) =>
                            item.key === variant.key ? { ...item, costPrice: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </Field>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Field label="Attributes" hint="Comma-separated key: value pairs, e.g. Color: Black, Size: M">
                    <Input
                      value={variant.attributesText}
                      onChange={(event) =>
                        setVariants((prev) =>
                          prev.map((item) =>
                            item.key === variant.key ? { ...item, attributesText: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Color: Matte Black, Storage: 128GB"
                      className="text-xs"
                    />
                  </Field>
                  <div className="pb-1">
                    <Switch
                      checked={variant.isActive}
                      onChange={(checked) =>
                        setVariants((prev) =>
                          prev.map((item) =>
                            item.key === variant.key ? { ...item, isActive: checked } : item,
                          ),
                        )
                      }
                      label="Active"
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Media & SEO" description="Add image URLs with live preview, plus search metadata." />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  value={newImageUrl}
                  onChange={(event) => setNewImageUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addImage();
                    }
                  }}
                  placeholder="https://cdn.example.com/product-front.jpg"
                  className="font-mono text-xs"
                />
              </div>
              <Button type="button" variant="secondary" icon="plus" onClick={addImage}>
                Add image
              </Button>
            </div>

            {imageList.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-3">
                {imageList.map((url, idx) => (
                  <div key={`${url}-${idx}`} className="overflow-hidden rounded-xl border border-line bg-[#faf9f5]">
                    <div className="relative flex h-28 items-center justify-center overflow-hidden bg-surface">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Product media ${idx + 1}`} className="h-full w-full object-cover" />
                      {idx === 0 && (
                        <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[9.5px] font-medium text-white">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 px-2.5 py-2">
                      <span className="truncate font-mono text-[10px] text-muted" title={url}>
                        {url}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveImage(idx, -1)}
                          className="rounded p-1 text-muted hover:bg-[#ecebe4] disabled:opacity-30"
                          aria-label="Move image earlier"
                        >
                          <Icon name="chevronLeft" size={12} />
                        </button>
                        <button
                          type="button"
                          disabled={idx === imageList.length - 1}
                          onClick={() => moveImage(idx, 1)}
                          className="rounded p-1 text-muted hover:bg-[#ecebe4] disabled:opacity-30"
                          aria-label="Move image later"
                        >
                          <Icon name="chevronRight" size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageList((prev) => prev.filter((_, i) => i !== idx))}
                          className="rounded p-1 text-muted hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Remove image"
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

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

        <Card>
          <CardHeader title="Summary" description={`${variants.length} variant(s) · ${imageList.length} image(s)`} />
          <div className="divide-y divide-[#efede5]">
            {variants.map((variant) => (
              <div key={variant.key} className="flex items-center justify-between gap-3 px-5 py-3 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{variant.name || "Untitled variant"}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted">{variant.sku || "Auto SKU"}</p>
                </div>
                <div className="text-right">
                  <p className="num font-medium">{Number(variant.price || 0).toFixed(2)}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {variant.isDefault ? "Default" : variant.isActive ? "Active" : "Inactive"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

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
