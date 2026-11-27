"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, download, query, type Paged } from "@/lib/api";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Brand, Category, ProductListItem, StockRow } from "@/lib/types";
import { currency, number } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableSkeleton,
  cn,
  useToast,
} from "@/components/ui";
import { ProgressBar } from "@/components/charts";

type ImportResult = { created: number; updated: number; skipped: number; errors: string[] };

export default function ProductsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"table" | "grid">("table");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const term = params.get("search");
    if (term) setSearch(term);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, brand, status, sort]);

  const listPath = `/api/v1/products${query({
    search: debouncedSearch,
    categoryId: category,
    brandId: brand,
    status,
    sort,
    page,
    pageSize: view === "grid" ? 12 : 10,
  })}`;
  const { data, loading, error, reload } = useApi<Paged<ProductListItem>>(listPath);
  const categories = useApi<Category[]>("/api/v1/categories");
  const brands = useApi<Brand[]>("/api/v1/brands");
  const lowStock = useApi<StockRow[]>("/api/v1/inventory/low-stock");
  const activeCount = useApi<Paged<ProductListItem>>("/api/v1/products?status=Active&pageSize=1");
  const draftCount = useApi<Paged<ProductListItem>>("/api/v1/products?status=Draft&pageSize=1");

  const lowStockProducts = useMemo(
    () => new Set((lowStock.data ?? []).map((row) => row.productId)),
    [lowStock.data],
  );

  const stats = [
    { label: "Total products", value: data?.totalCount ?? 0, icon: "box" as const, tone: "brand" },
    { label: "Active", value: activeCount.data?.totalCount ?? 0, icon: "check" as const, tone: "emerald" },
    { label: "Drafts", value: draftCount.data?.totalCount ?? 0, icon: "edit" as const, tone: "zinc" },
    { label: "Low stock", value: lowStock.data?.length ?? 0, icon: "alert" as const, tone: "amber" },
  ];

  async function onImport(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const result = await api<ImportResult>("/api/v1/products/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: text,
      });
      push({
        tone: "success",
        title: "CSV import complete",
        description: `${result.created} created · ${result.updated} updated · ${result.skipped} skipped${
          result.errors.length ? ` · ${result.errors.length} error(s)` : ""
        }`,
      });
      await reload();
    } catch (cause) {
      push({
        tone: "error",
        title: "Import failed",
        description: cause instanceof Error ? cause.message : "Check the CSV format and try again.",
      });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Everything you sell, with variants, pricing and live stock visibility."
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onImport(file);
          }}
        />
        <Button variant="secondary" icon="upload" loading={importing} onClick={() => fileRef.current?.click()}>
          Import CSV
        </Button>
        <Button
          variant="secondary"
          icon="download"
          onClick={() =>
            download("/api/v1/products/export", "products.csv").catch((cause) =>
              push({ tone: "error", title: "Export failed", description: cause.message }),
            )
          }
        >
          Export
        </Button>
        <Link href="/products/new">
          <Button variant="primary" icon="plus">
            New product
          </Button>
        </Link>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="flex items-center gap-3 px-4 py-3.5">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border",
                stat.tone === "brand" && "border-[#cfe2d6] bg-brand-soft text-brand",
                stat.tone === "emerald" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                stat.tone === "zinc" && "border-[#e3e0d6] bg-[#f4f2eb] text-[#70746a]",
                stat.tone === "amber" && "border-amber-200 bg-amber-50 text-amber-700",
              )}
            >
              <Icon name={stat.icon} size={15} />
            </span>
            <div>
              <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{stat.label}</p>
              <p className="num mt-0.5 text-lg font-semibold leading-none">{number(stat.value)}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3.5 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, SKU or tag…"
            className="w-full lg:max-w-[280px]"
          />
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:justify-end">
            <Select value={category} onChange={(event) => setCategory(event.target.value)} className="lg:w-[150px]">
              <option value="">All categories</option>
              {(categories.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select value={brand} onChange={(event) => setBrand(event.target.value)} className="lg:w-[140px]">
              <option value="">All brands</option>
              {(brands.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select value={status} onChange={(event) => setStatus(event.target.value)} className="lg:w-[130px]">
              <option value="">Any status</option>
              <option value="Active">Active</option>
              <option value="Draft">Draft</option>
              <option value="Archived">Archived</option>
            </Select>
            <Select value={sort} onChange={(event) => setSort(event.target.value)} className="lg:w-[150px]">
              <option value="newest">Newest first</option>
              <option value="name">Name A–Z</option>
              <option value="price_asc">Price low–high</option>
              <option value="price_desc">Price high–low</option>
            </Select>
            <div className="col-span-2 flex rounded-lg border border-line bg-[#f3f1ea] p-0.5 sm:col-span-1">
              {(["table", "grid"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  aria-label={`${mode} view`}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10.5px] font-medium capitalize transition-colors",
                    view === mode ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink-soft",
                  )}
                >
                  <Icon name={mode === "table" ? "layers" : "dashboard"} size={12} />
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon="box"
            title="No products match these filters"
            description="Adjust the filters, or create a product to start building your catalog."
            action={
              <Link href="/products/new">
                <Button variant="primary" size="sm" icon="plus">
                  New product
                </Button>
              </Link>
            }
          />
        ) : view === "table" ? (
          <Table className="min-w-[800px]">
            <THead>
              <tr>
                <TH>Product</TH>
                <TH>Category</TH>
                <TH align="right">Price</TH>
                <TH>Stock</TH>
                <TH>Status</TH>
                <TH align="right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {data.items.map((product) => {
                const low = lowStockProducts.has(product.id);
                return (
                  <TR key={product.id} onClick={() => router.push(`/products/${product.id}`)}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-[#f7f5ef] text-[#7d8276]">
                          <Icon name="box" size={16} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-medium text-ink">{product.name}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted">
                            {product.sku}
                            {product.isFeatured && <span className="text-amber-600">★ featured</span>}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <p className="text-[12px] text-ink-soft">{product.categoryName ?? "Uncategorized"}</p>
                      <p className="mt-0.5 text-[10.5px] text-muted">{product.brandName ?? "No brand"}</p>
                    </TD>
                    <TD align="right">
                      <p className="num text-[12.5px] font-medium">{currency(product.price, product.currencyCode)}</p>
                      <p className="num mt-0.5 text-[10px] text-muted">
                        cost {currency(product.costPrice, product.currencyCode)}
                      </p>
                    </TD>
                    <TD>
                      <div className="w-[104px]">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="num font-medium text-ink-soft">
                            {number(product.stock)}
                            <span className="font-normal text-muted"> on hand</span>
                          </span>
                          {low && <Badge tone="rose">Low</Badge>}
                        </div>
                        <ProgressBar
                          value={product.stock}
                          max={Math.max(product.stock + product.reserved, 60)}
                          tone={low ? "rose" : product.stock < 15 ? "amber" : "brand"}
                          className="mt-1.5"
                        />
                      </div>
                    </TD>
                    <TD>
                      <StatusBadge status={product.status} />
                    </TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${product.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/products/${product.id}`);
                          }}
                        >
                          <Icon name="chevronRight" size={15} />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((product) => {
              const low = lowStockProducts.has(product.id);
              return (
                <Link
                  key={product.id}
                  href={`/products/${product.id}`}
                  className="group rounded-xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-[#f7f5ef] text-[#7d8276]">
                      <Icon name="box" size={18} />
                    </span>
                    <StatusBadge status={product.status} />
                  </div>
                  <p className="mt-3 truncate text-[13px] font-medium text-ink group-hover:text-brand">
                    {product.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted">{product.sku}</p>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <p className="num text-[15px] font-semibold">{currency(product.price, product.currencyCode)}</p>
                      <p className="text-[10px] text-muted">{product.categoryName ?? "Uncategorized"}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn("num text-[12px] font-medium", low ? "text-rose-600" : "text-ink-soft")}>
                        {number(product.stock)}
                      </p>
                      <p className="text-[10px] text-muted">on hand</p>
                    </div>
                  </div>
                  {low && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-rose-600">
                      <Icon name="alert" size={11} /> Below reorder point
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {data && !loading && !error && (
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            totalCount={data.totalCount}
            pageSize={data.pageSize}
            label="products"
            onPage={setPage}
          />
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-[10.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <Icon name="sparkle" size={11} /> Effective prices are computed server-side, including live offers.
        </span>
        <span className="flex items-center gap-1.5">
          <Icon name="shield" size={11} /> Scoped to {category || brand ? "selected filters" : "this workspace"}
        </span>
      </div>
    </div>
  );
}
