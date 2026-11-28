"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { errorMessage, useApi } from "@/lib/hooks";
import type { Category } from "@/lib/types";
import { number } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Badge,
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
  Select,
  Switch,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableSkeleton,
  Textarea,
  useToast,
} from "@/components/ui";

type CategoryForm = {
  name: string;
  parentId: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
};

const emptyForm: CategoryForm = {
  name: "",
  parentId: "",
  description: "",
  isActive: true,
  sortOrder: "0",
};

export default function CategoriesPage() {
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<Category[]>("/api/v1/categories");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setEditing(null);
      setForm(emptyForm);
      setOpen(true);
    }
  }, []);

  const categories = useMemo(() => data ?? [], [data]);
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q),
    );
  }, [categories, search]);

  function openModal(category?: Category) {
    if (category) {
      setEditing(category);
      setForm({
        name: category.name,
        parentId: category.parentId ?? "",
        description: category.description ?? "",
        isActive: category.isActive,
        sortOrder: String(category.sortOrder),
      });
    } else {
      setEditing(null);
      setForm(emptyForm);
    }
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      push({ tone: "error", title: "Category name is required" });
      return;
    }
    setBusy(true);
    try {
      await api(editing ? `/api/v1/categories/${editing.id}` : "/api/v1/categories", {
        method: editing ? "PUT" : "POST",
        body: {
          name: form.name.trim(),
          parentId: form.parentId || null,
          description: form.description.trim() || null,
          isActive: form.isActive,
          sortOrder: Number(form.sortOrder) || 0,
        },
      });
      await reload();
      push({ title: editing ? "Category updated" : "Category created" });
      setOpen(false);
    } catch (cause) {
      push({ tone: "error", title: "Could not save category", description: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/v1/categories/${deleting.id}`, { method: "DELETE" });
      await reload();
      push({ title: "Category deleted" });
      setDeleting(null);
    } catch (cause) {
      push({ tone: "error", title: "Could not delete category", description: errorMessage(cause) });
    } finally {
      setDeleteBusy(false);
    }
  }

  const activeCount = categories.filter((c) => c.isActive).length;
  const topLevelCount = categories.filter((c) => !c.parentId).length;
  const totalProducts = categories.reduce((sum, c) => sum + c.productCount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalog"
        title="Categories"
        description="Organize your catalog into nested categories with sort order and visibility controls."
      >
        <Link href="/products">
          <Button variant="secondary" icon="box">
            View products
          </Button>
        </Link>
        <Button variant="primary" icon="plus" onClick={() => openModal()}>
          New category
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total categories", value: number(categories.length), hint: "In this workspace" },
          { label: "Active", value: number(activeCount), hint: "Visible in catalog" },
          { label: "Top-level", value: number(topLevelCount), hint: "Root categories" },
          { label: "Assigned products", value: number(totalProducts), hint: "Across all categories" },
        ].map((stat) => (
          <Card key={stat.label} className="px-4 py-3.5">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{stat.label}</p>
            <p className="num mt-1 text-xl font-semibold leading-none">{stat.value}</p>
            <p className="mt-1 text-[10px] text-muted">{stat.hint}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search categories by name or slug…"
            className="w-full sm:max-w-[320px]"
          />
          <span className="text-[11px] text-muted">{filtered.length} category(s)</span>
        </div>

        {loading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="folder"
            title={search ? "No categories match your search" : "No categories yet"}
            description="Group products into categories to power catalog filters, offers, and AI search."
            action={
              !search ? (
                <Button variant="primary" size="sm" icon="plus" onClick={() => openModal()}>
                  New category
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table className="min-w-[720px]">
            <THead>
              <tr>
                <TH>Category</TH>
                <TH>Parent</TH>
                <TH align="right">Products</TH>
                <TH align="right">Sort</TH>
                <TH>Status</TH>
                <TH align="right"></TH>
              </tr>
            </THead>
            <tbody>
              {filtered.map((category) => {
                const parent = category.parentId ? byId.get(category.parentId) : null;
                return (
                  <TR key={category.id}>
                    <TD>
                      <p className="text-[12.5px] font-medium text-ink">{category.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted">
                        /{category.slug}
                        {category.description ? ` · ${category.description}` : ""}
                      </p>
                    </TD>
                    <TD className="text-[12px] text-muted">{parent ? parent.name : "Root"}</TD>
                    <TD align="right" className="num text-[12px] font-medium">
                      {number(category.productCount)}
                    </TD>
                    <TD align="right" className="num text-[12px] text-muted">
                      {category.sortOrder}
                    </TD>
                    <TD>
                      <Badge tone={category.isActive ? "emerald" : "zinc"} dot>
                        {category.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" icon="edit" onClick={() => openModal(category)}>
                          Edit
                        </Button>
                        <button
                          type="button"
                          aria-label={`Delete ${category.name}`}
                          onClick={() => setDeleting(category)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit category" : "New category"}
        description="Categories are workspace-scoped. Manager role or above is required to save."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={busy} onClick={() => void save()}>
              {editing ? "Save changes" : "Create category"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Lighting"
              autoFocus
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Parent category">
              <Select
                value={form.parentId}
                onChange={(event) => setForm({ ...form, parentId: event.target.value })}
              >
                <option value="">None (top-level)</option>
                {categories
                  .filter((c) => c.id !== editing?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Sort order">
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Optional description of products in this category"
              rows={3}
            />
          </Field>
          <Switch
            checked={form.isActive}
            onChange={(checked) => setForm({ ...form, isActive: checked })}
            label="Active category"
            description="Inactive categories remain linked to historical products."
          />
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title={`Delete ${deleting?.name ?? "this category"}?`}
        description="Categories with assigned products or child categories must be cleared first."
        confirmLabel="Delete category"
        loading={deleteBusy}
      />
    </div>
  );
}
