"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { errorMessage, useApi } from "@/lib/hooks";
import type { Brand } from "@/lib/types";
import { number } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableSkeleton,
  useToast,
} from "@/components/ui";

export default function BrandsPage() {
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<Brand[]>("/api/v1/brands");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [form, setForm] = useState({ name: "", logoUrl: "" });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Brand | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const brands = useMemo(() => data ?? [], [data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q));
  }, [brands, search]);

  function openModal(brand?: Brand) {
    if (brand) {
      setEditing(brand);
      setForm({ name: brand.name, logoUrl: brand.logoUrl ?? "" });
    } else {
      setEditing(null);
      setForm({ name: "", logoUrl: "" });
    }
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      push({ tone: "error", title: "Brand name is required" });
      return;
    }
    setBusy(true);
    try {
      await api(editing ? `/api/v1/brands/${editing.id}` : "/api/v1/brands", {
        method: editing ? "PUT" : "POST",
        body: { name: form.name.trim(), logoUrl: form.logoUrl.trim() || null },
      });
      await reload();
      push({ title: editing ? "Brand updated" : "Brand created" });
      setOpen(false);
    } catch (cause) {
      push({ tone: "error", title: "Could not save brand", description: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/v1/brands/${deleting.id}`, { method: "DELETE" });
      await reload();
      push({ title: "Brand deleted" });
      setDeleting(null);
    } catch (cause) {
      push({ tone: "error", title: "Could not delete brand", description: errorMessage(cause) });
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalog"
        title="Brands"
        description="Manage product manufacturers and brand labels across your workspace catalog."
      >
        <Link href="/products">
          <Button variant="secondary" icon="box">
            View products
          </Button>
        </Link>
        <Button variant="primary" icon="plus" onClick={() => openModal()}>
          New brand
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Total brands</p>
          <p className="num mt-1 text-xl font-semibold leading-none">{number(brands.length)}</p>
          <p className="mt-1 text-[10px] text-muted">In this workspace</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">With logo</p>
          <p className="num mt-1 text-xl font-semibold leading-none">
            {number(brands.filter((b) => Boolean(b.logoUrl)).length)}
          </p>
          <p className="mt-1 text-[10px] text-muted">Configured image URLs</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Linked products</p>
          <p className="num mt-1 text-xl font-semibold leading-none">
            {number(brands.reduce((sum, b) => sum + b.productCount, 0))}
          </p>
          <p className="mt-1 text-[10px] text-muted">Assigned across catalog</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search brands…"
            className="w-full sm:max-w-[320px]"
          />
          <span className="text-[11px] text-muted">{filtered.length} brand(s)</span>
        </div>

        {loading ? (
          <TableSkeleton rows={6} columns={4} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="award"
            title={search ? "No brands match your search" : "No brands yet"}
            description="Create brands to organize products and power brand filtering."
            action={
              !search ? (
                <Button variant="primary" size="sm" icon="plus" onClick={() => openModal()}>
                  New brand
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table className="min-w-[640px]">
            <THead>
              <tr>
                <TH>Brand</TH>
                <TH>Slug</TH>
                <TH align="right">Products</TH>
                <TH align="right"></TH>
              </tr>
            </THead>
            <tbody>
              {filtered.map((brand) => (
                <TR key={brand.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-[#faf9f5] text-muted">
                        {brand.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={brand.logoUrl} alt={brand.name} className="h-full w-full object-contain p-1" />
                        ) : (
                          <Icon name="award" size={16} />
                        )}
                      </span>
                      <span className="text-[12.5px] font-medium text-ink">{brand.name}</span>
                    </div>
                  </TD>
                  <TD className="font-mono text-[11px] text-muted">/{brand.slug}</TD>
                  <TD align="right" className="num text-[12px] font-medium">
                    {number(brand.productCount)}
                  </TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" icon="edit" onClick={() => openModal(brand)}>
                        Edit
                      </Button>
                      <button
                        type="button"
                        aria-label={`Delete ${brand.name}`}
                        onClick={() => setDeleting(brand)}
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit brand" : "New brand"}
        description="Manager role or above is required to create or edit brands."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={busy} onClick={() => void save()}>
              {editing ? "Save changes" : "Create brand"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Brand name" required>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Northwind Studio"
              autoFocus
            />
          </Field>
          <Field label="Logo URL" hint="Optional external HTTPS image URL.">
            <Input
              value={form.logoUrl}
              onChange={(event) => setForm({ ...form, logoUrl: event.target.value })}
              placeholder="https://cdn.example.com/logo.png"
              className="font-mono text-xs"
            />
          </Field>
          {form.logoUrl.trim() && (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-[#faf9f5] p-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.logoUrl.trim()} alt="Logo preview" className="h-full w-full object-contain p-1" />
              </div>
              <span className="text-[11px] text-muted">Logo preview</span>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title={`Delete ${deleting?.name ?? "this brand"}?`}
        description="Products assigned to this brand must be reassigned before deletion."
        confirmLabel="Delete brand"
        loading={deleteBusy}
      />
    </div>
  );
}
