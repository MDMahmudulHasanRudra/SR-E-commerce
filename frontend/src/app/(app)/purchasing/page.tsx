"use client";

import { useEffect, useMemo, useState } from "react";
import { api, query, type Paged } from "@/lib/api";
import { errorMessage, useApi, useDebounced } from "@/lib/hooks";
import type {
  FinanceSummary,
  PurchaseOrderDetail,
  PurchaseOrderListItem,
  StockRow,
  Supplier,
  SupplierPayment,
  Warehouse,
} from "@/lib/types";
import { currency, date, dateTime, number } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  InfoRow,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  StatusBadge,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableSkeleton,
  Tabs,
  Textarea,
  useToast,
} from "@/components/ui";

type SupplierForm = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  isActive: boolean;
};

type PoLine = { variantId: string; quantityOrdered: string; unitCost: string };

const emptySupplier: SupplierForm = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  isActive: true,
};

const methods = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
  { value: "mobile", label: "Mobile money" },
];

export default function PurchasingPage() {
  const { push } = useToast();
  const [tab, setTab] = useState("orders");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  const orders = useApi<Paged<PurchaseOrderListItem>>(
    `/api/v1/purchase-orders${query({ search: debouncedSearch, status, page, pageSize: 12 })}`,
  );
  const suppliers = useApi<Supplier[]>("/api/v1/suppliers");
  const payments = useApi<SupplierPayment[]>("/api/v1/supplier-payments");
  const stock = useApi<Paged<StockRow>>("/api/v1/inventory/stock?pageSize=200");
  const warehouses = useApi<Warehouse[]>("/api/v1/warehouses");
  const finance = useApi<FinanceSummary>("/api/v1/finance/summary");

  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useApi<PurchaseOrderDetail>(detailId ? `/api/v1/purchase-orders/${detailId}` : null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    supplierId: "",
    expectedDate: "",
    taxTotal: "0",
    notes: "",
  });
  const [lines, setLines] = useState<PoLine[]>([{ variantId: "", quantityOrdered: "1", unitCost: "0" }]);
  const [createBusy, setCreateBusy] = useState(false);

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveWarehouse, setReceiveWarehouse] = useState("");
  const [receiveLines, setReceiveLines] = useState<Record<string, string>>({});
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveBusy, setReceiveBusy] = useState(false);

  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierEditing, setSupplierEditing] = useState<string | null>(null);
  const [supplierView, setSupplierView] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(emptySupplier);
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [supplierDelete, setSupplierDelete] = useState<Supplier | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    supplierId: "",
    purchaseOrderId: "",
    amount: "",
    method: "bank",
    reference: "",
    paidAt: "",
  });
  const [payBusy, setPayBusy] = useState(false);

  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setTab("orders");
      setCreateOpen(true);
    }
  }, []);

  useEffect(() => {
    if (warehouses.data && warehouses.data.length > 0 && !receiveWarehouse) {
      const preferred = warehouses.data.find((warehouse) => warehouse.isDefault) ?? warehouses.data[0];
      setReceiveWarehouse(preferred.id);
    }
  }, [warehouses.data, receiveWarehouse]);

  const variants = useMemo(() => stock.data?.items ?? [], [stock.data]);
  const supplierList = suppliers.data ?? [];
  const lowStockItems = useApi<StockRow[]>("/api/v1/inventory/low-stock");

  function fillLowStockLines() {
    const low = lowStockItems.data ?? [];
    if (low.length === 0) {
      push({ tone: "info", title: "No low-stock variants right now" });
      return;
    }
    const unique = new Map<string, StockRow>();
    low.forEach((row) => {
      if (!unique.has(row.variantId)) unique.set(row.variantId, row);
    });
    setLines(
      [...unique.values()].map((row) => ({
        variantId: row.variantId,
        quantityOrdered: String(Math.max(1, row.reorderQuantity || 10)),
        unitCost: String(row.costPrice),
      })),
    );
    push({ title: `Added ${unique.size} low-stock item(s)` });
  }

  function resetPo() {
    setCreateForm({ supplierId: supplierList[0]?.id ?? "", expectedDate: "", taxTotal: "0", notes: "" });
    setLines([{ variantId: "", quantityOrdered: "1", unitCost: "0" }]);
  }

  function openCreate() {
    resetPo();
    setCreateOpen(true);
  }

  async function createOrder() {
    if (!createForm.supplierId) {
      push({ tone: "error", title: "Choose a supplier" });
      return;
    }
    const items = lines
      .filter((line) => line.variantId && Number(line.quantityOrdered) > 0)
      .map((line) => ({
        variantId: line.variantId,
        quantityOrdered: Math.max(1, Math.floor(Number(line.quantityOrdered))),
        unitCost: Math.max(0, Number(line.unitCost) || 0),
      }));
    if (items.length === 0) {
      push({ tone: "error", title: "Add at least one line item" });
      return;
    }
    setCreateBusy(true);
    try {
      const created = await api<PurchaseOrderDetail>("/api/v1/purchase-orders", {
        method: "POST",
        body: {
          supplierId: createForm.supplierId,
          expectedDateUtc: createForm.expectedDate ? new Date(createForm.expectedDate).toISOString() : null,
          taxTotal: Math.max(0, Number(createForm.taxTotal) || 0),
          notes: createForm.notes || null,
          items,
        },
      });
      await orders.reload();
      push({ title: "Purchase order created", description: `${created.poNumber} is saved as a draft.` });
      setCreateOpen(false);
      setDetailId(created.id);
    } catch (cause) {
      push({ tone: "error", title: "Could not create purchase order", description: errorMessage(cause) });
    } finally {
      setCreateBusy(false);
    }
  }

  async function poAction(id: string, action: "order" | "cancel") {
    setActionBusy(action);
    try {
      await api(`/api/v1/purchase-orders/${id}/${action}`, { method: "POST" });
      await Promise.all([orders.reload(), detailId === id ? detail.reload() : Promise.resolve()]);
      push({ title: action === "order" ? "Purchase order marked as ordered" : "Purchase order cancelled" });
    } catch (cause) {
      push({ tone: "error", title: "Could not update purchase order", description: errorMessage(cause) });
    } finally {
      setActionBusy(null);
    }
  }

  function openReceive() {
    if (!detail.data) return;
    const defaults: Record<string, string> = {};
    detail.data.items.forEach((item) => {
      defaults[item.id] = String(Math.max(0, item.quantityOrdered - item.quantityReceived));
    });
    setReceiveLines(defaults);
    setReceiveNotes("");
    setReceiveOpen(true);
  }

  async function receive() {
    if (!detail.data || !receiveWarehouse) {
      push({ tone: "error", title: "Choose a warehouse" });
      return;
    }
    const payload = detail.data.items
      .map((item) => ({ purchaseOrderItemId: item.id, quantity: Number(receiveLines[item.id] ?? 0) || 0 }))
      .filter((line) => line.quantity > 0);
    if (payload.length === 0) {
      push({ tone: "error", title: "Enter a quantity to receive" });
      return;
    }
    setReceiveBusy(true);
    try {
      await api(`/api/v1/purchase-orders/${detail.data.id}/receive`, {
        method: "POST",
        body: { warehouseId: receiveWarehouse, lines: payload, notes: receiveNotes || null },
      });
      await Promise.all([orders.reload(), detail.reload(), stock.reload()]);
      push({ title: "Goods received", description: "Stock levels have been updated." });
      setReceiveOpen(false);
    } catch (cause) {
      push({ tone: "error", title: "Could not receive goods", description: errorMessage(cause) });
    } finally {
      setReceiveBusy(false);
    }
  }

  function openSupplier(supplier?: Supplier) {
    if (supplier) {
      setSupplierEditing(supplier.id);
      setSupplierForm({
        name: supplier.name,
        contactName: supplier.contactName ?? "",
        email: supplier.email ?? "",
        phone: supplier.phone ?? "",
        address: supplier.address ?? "",
        notes: supplier.notes ?? "",
        isActive: supplier.isActive,
      });
    } else {
      setSupplierEditing(null);
      setSupplierForm(emptySupplier);
    }
    setSupplierOpen(true);
  }

  async function saveSupplier() {
    if (!supplierForm.name.trim()) {
      push({ tone: "error", title: "Supplier name is required" });
      return;
    }
    setSupplierBusy(true);
    try {
      await api(supplierEditing ? `/api/v1/suppliers/${supplierEditing}` : "/api/v1/suppliers", {
        method: supplierEditing ? "PUT" : "POST",
        body: {
          name: supplierForm.name.trim(),
          contactName: supplierForm.contactName || null,
          email: supplierForm.email || null,
          phone: supplierForm.phone || null,
          address: supplierForm.address || null,
          notes: supplierForm.notes || null,
          isActive: supplierForm.isActive,
        },
      });
      await suppliers.reload();
      push({ title: supplierEditing ? "Supplier updated" : "Supplier created" });
      setSupplierOpen(false);
    } catch (cause) {
      push({ tone: "error", title: "Could not save supplier", description: errorMessage(cause) });
    } finally {
      setSupplierBusy(false);
    }
  }

  async function deleteSupplier() {
    if (!supplierDelete) return;
    setDeleteBusy(true);
    try {
      await api(`/api/v1/suppliers/${supplierDelete.id}`, { method: "DELETE" });
      await suppliers.reload();
      push({ title: "Supplier removed" });
      setSupplierDelete(null);
    } catch (cause) {
      push({ tone: "error", title: "Could not remove supplier", description: errorMessage(cause) });
    } finally {
      setDeleteBusy(false);
    }
  }

  function openPayment(order?: PurchaseOrderDetail) {
    setPayForm({
      supplierId: order?.supplierId ?? supplierList[0]?.id ?? "",
      purchaseOrderId: order?.id ?? "",
      amount: order ? String(Math.max(0, order.total - order.amountPaid)) : "",
      method: "bank",
      reference: "",
      paidAt: "",
    });
    setPayOpen(true);
  }

  async function paySupplier() {
    const amount = Number(payForm.amount);
    if (!payForm.supplierId) {
      push({ tone: "error", title: "Choose a supplier" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      push({ tone: "error", title: "Enter a valid amount" });
      return;
    }
    setPayBusy(true);
    try {
      await api("/api/v1/supplier-payments", {
        method: "POST",
        body: {
          supplierId: payForm.supplierId,
          purchaseOrderId: payForm.purchaseOrderId || null,
          amount,
          method: payForm.method,
          reference: payForm.reference || null,
          paidAtUtc: payForm.paidAt ? new Date(payForm.paidAt).toISOString() : null,
        },
      });
      await Promise.all([
        payments.reload(),
        suppliers.reload(),
        orders.reload(),
        finance.reload(),
        detailId && detailId === payForm.purchaseOrderId ? detail.reload() : Promise.resolve(),
      ]);
      push({ title: "Supplier payment recorded" });
      setPayOpen(false);
    } catch (cause) {
      push({ tone: "error", title: "Could not record payment", description: errorMessage(cause) });
    } finally {
      setPayBusy(false);
    }
  }

  const payables = finance.data?.payables ?? 0;
  const totalPaid = (payments.data ?? []).reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Purchasing"
        description="Buy stock from suppliers, receive it into a warehouse and track what is still owed."
      >
        <Button variant="secondary" icon="wallet" onClick={() => openPayment()}>
          Pay supplier
        </Button>
        <Button variant="primary" icon="plus" onClick={openCreate}>
          New purchase order
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Purchase orders</p>
          <p className="num mt-1 text-xl font-semibold leading-none">{number(orders.data?.totalCount ?? 0)}</p>
          <p className="mt-1 text-[10px] text-muted">In this workspace</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Suppliers</p>
          <p className="num mt-1 text-xl font-semibold leading-none">{number(supplierList.length)}</p>
          <p className="mt-1 text-[10px] text-muted">Active and inactive</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Payables</p>
          <p className={`num mt-1 text-xl font-semibold leading-none ${payables > 0 ? "text-amber-600" : "text-ink"}`}>
            {currency(payables)}
          </p>
          <p className="mt-1 text-[10px] text-muted">Outstanding to suppliers</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Paid to suppliers</p>
          <p className="num mt-1 text-xl font-semibold leading-none">{currency(totalPaid)}</p>
          <p className="mt-1 text-[10px] text-muted">{number(payments.data?.length ?? 0)} recorded payment(s)</p>
        </Card>
      </div>

      <Card>
        <div className="border-b border-line p-3.5">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "orders", label: "Purchase orders", count: orders.data?.totalCount ?? 0 },
              { value: "suppliers", label: "Suppliers", count: supplierList.length },
              { value: "payments", label: "Payments", count: payments.data?.length ?? 0 },
            ]}
          />
        </div>

        {tab === "orders" && (
          <>
            <div className="flex flex-col gap-3 border-b border-line p-3.5 lg:flex-row lg:items-center">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search PO number or supplier…"
                className="w-full lg:max-w-[300px]"
              />
              <div className="flex flex-1 items-center gap-2 lg:justify-end">
                <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-[190px]">
                  <option value="">Any status</option>
                  {["Draft", "Ordered", "PartiallyReceived", "Received", "Cancelled"].map((value) => (
                    <option key={value} value={value}>
                      {value.replace(/([a-z])([A-Z])/g, "$1 $2")}
                    </option>
                  ))}
                </Select>
                {status && (
                  <Button variant="ghost" size="sm" icon="close" onClick={() => setStatus("")}>
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {orders.loading ? (
              <TableSkeleton rows={7} columns={6} />
            ) : orders.error ? (
              <ErrorState message={orders.error.message} onRetry={orders.reload} />
            ) : !orders.data || orders.data.items.length === 0 ? (
              <EmptyState
                icon="truck"
                title="No purchase orders found"
                description="Create a purchase order to restock low inventory."
                action={
                  <Button variant="primary" size="sm" icon="plus" onClick={openCreate}>
                    New purchase order
                  </Button>
                }
              />
            ) : (
              <Table className="min-w-[840px]">
                <THead>
                  <tr>
                    <TH>PO</TH>
                    <TH>Supplier</TH>
                    <TH>Order date</TH>
                    <TH>Expected</TH>
                    <TH align="right">Total</TH>
                    <TH align="right">Paid</TH>
                    <TH>Status</TH>
                    <TH align="right"></TH>
                  </tr>
                </THead>
                <tbody>
                  {orders.data.items.map((order) => (
                    <TR key={order.id} onClick={() => setDetailId(order.id)}>
                      <TD className="font-mono text-[11.5px] font-medium">{order.poNumber}</TD>
                      <TD className="max-w-[180px] truncate text-[12px] text-ink-soft">{order.supplierName}</TD>
                      <TD className="whitespace-nowrap text-[11px] text-muted">{date(order.orderDateUtc)}</TD>
                      <TD className="whitespace-nowrap text-[11px] text-muted">
                        {order.expectedDateUtc ? date(order.expectedDateUtc) : "—"}
                      </TD>
                      <TD align="right" className="num text-[12.5px] font-medium">
                        {currency(order.total)}
                      </TD>
                      <TD align="right" className="num text-[12px] text-muted">
                        {currency(order.amountPaid)}
                      </TD>
                      <TD>
                        <StatusBadge status={order.status} />
                      </TD>
                      <TD align="right">
                        <Icon name="chevronRight" size={15} className="ml-auto text-[#b6b9ae]" />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}

            {orders.data && !orders.loading && !orders.error && (
              <Pagination
                page={orders.data.page}
                totalPages={orders.data.totalPages}
                totalCount={orders.data.totalCount}
                pageSize={orders.data.pageSize}
                label="purchase orders"
                onPage={setPage}
              />
            )}
          </>
        )}

        {tab === "suppliers" && (
          <>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[11px] text-muted">Supplier records are workspace-scoped.</p>
              <Button variant="secondary" size="sm" icon="plus" onClick={() => openSupplier()}>
                New supplier
              </Button>
            </div>
            {suppliers.loading ? (
              <TableSkeleton rows={6} columns={5} />
            ) : suppliers.error ? (
              <ErrorState message={suppliers.error.message} onRetry={suppliers.reload} />
            ) : supplierList.length === 0 ? (
              <EmptyState
                icon="truck"
                title="No suppliers yet"
                description="Add a supplier before creating your first purchase order."
                action={
                  <Button variant="primary" size="sm" icon="plus" onClick={() => openSupplier()}>
                    New supplier
                  </Button>
                }
              />
            ) : (
              <Table className="min-w-[760px]">
                <THead>
                  <tr>
                    <TH>Supplier</TH>
                    <TH>Contact</TH>
                    <TH align="right">Open POs</TH>
                    <TH align="right">Total purchased</TH>
                    <TH>Status</TH>
                    <TH align="right"></TH>
                  </tr>
                </THead>
                <tbody>
                  {supplierList.map((supplier) => (
                    <TR key={supplier.id} onClick={() => setSupplierView(supplier)}>
                      <TD>
                        <p className="text-[12.5px] font-medium text-ink">{supplier.name}</p>
                        <p className="mt-0.5 max-w-[220px] truncate text-[10.5px] text-muted">{supplier.address ?? "No address"}</p>
                      </TD>
                      <TD>
                        <p className="text-[11.5px] text-ink-soft">{supplier.contactName ?? "—"}</p>
                        <p className="text-[10.5px] text-muted">{supplier.email ?? supplier.phone ?? "No contact details"}</p>
                      </TD>
                      <TD align="right" className="num text-[12px]">
                        {supplier.openPurchaseOrders}
                      </TD>
                      <TD align="right" className="num text-[12.5px] font-medium">
                        {currency(supplier.totalPurchased)}
                      </TD>
                      <TD>
                        <Badge tone={supplier.isActive ? "emerald" : "zinc"} dot>
                          {supplier.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TD>
                      <TD align="right">
                        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                          <Button variant="ghost" size="sm" icon="edit" onClick={() => openSupplier(supplier)}>
                            Edit
                          </Button>
                          <button
                            type="button"
                            aria-label="Remove supplier"
                            onClick={() => setSupplierDelete(supplier)}
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
          </>
        )}

        {tab === "payments" && (
          payments.loading ? (
            <TableSkeleton rows={6} columns={5} />
          ) : payments.error ? (
            <ErrorState message={payments.error.message} onRetry={payments.reload} />
          ) : (payments.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon="wallet"
              title="No supplier payments"
              description="Record a payment against a supplier or a specific purchase order."
              action={
                <Button variant="primary" size="sm" icon="wallet" onClick={() => openPayment()}>
                  Pay supplier
                </Button>
              }
            />
          ) : (
            <Table className="min-w-[680px]">
              <THead>
                <tr>
                  <TH>Supplier</TH>
                  <TH>Purchase order</TH>
                  <TH>Method</TH>
                  <TH>Paid</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <tbody>
                {(payments.data ?? []).map((payment) => (
                  <TR key={payment.id}>
                    <TD className="text-[12px] font-medium text-ink">{payment.supplierName}</TD>
                    <TD className="font-mono text-[10.5px] text-muted">
                      {payment.purchaseOrderId ? payment.purchaseOrderId.slice(0, 8) : "General"}
                    </TD>
                    <TD className="text-[12px] capitalize text-ink-soft">{payment.method}</TD>
                    <TD className="text-[11px] text-muted">{dateTime(payment.paidAtUtc)}</TD>
                    <TD align="right" className="num text-[12.5px] font-medium">
                      {currency(payment.amount)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        )}
      </Card>

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={detail.data ? detail.data.poNumber : "Purchase order"}
        description={detail.data ? `${detail.data.supplierName} · ${detail.data.items.length} line(s)` : undefined}
        size="xl"
        footer={
          detail.data ? (
            <>
              {["Draft"].includes(detail.data.status) && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={actionBusy === "order"}
                  onClick={() => void poAction(detail.data!.id, "order")}
                >
                  Mark ordered
                </Button>
              )}
              {["Ordered", "PartiallyReceived"].includes(detail.data.status) && (
                <Button variant="primary" size="sm" icon="warehouse" onClick={openReceive}>
                  Receive goods
                </Button>
              )}
              {["Draft", "Ordered", "PartiallyReceived"].includes(detail.data.status) && (
                <Button
                  variant="danger"
                  size="sm"
                  loading={actionBusy === "cancel"}
                  onClick={() => void poAction(detail.data!.id, "cancel")}
                >
                  Cancel PO
                </Button>
              )}
              <Button variant="secondary" size="sm" icon="wallet" onClick={() => openPayment(detail.data ?? undefined)}>
                Pay supplier
              </Button>
            </>
          ) : undefined
        }
      >
        {detail.loading || !detail.data ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.data.status} />
              <Badge tone="zinc">{detail.data.currencyCode}</Badge>
              <span className="text-[11px] text-muted">
                Ordered {date(detail.data.orderDateUtc)} · Expected {detail.data.expectedDateUtc ? date(detail.data.expectedDateUtc) : "not set"}
              </span>
            </div>

            <Table className="min-w-[540px]">
              <THead>
                <tr>
                  <TH>Item</TH>
                  <TH align="right">Ordered</TH>
                  <TH align="right">Received</TH>
                  <TH align="right">Unit cost</TH>
                  <TH align="right">Line total</TH>
                </tr>
              </THead>
              <tbody>
                {detail.data.items.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <p className="text-[12px] font-medium">{item.productName}</p>
                      <p className="font-mono text-[10px] text-muted">{item.sku}</p>
                    </TD>
                    <TD align="right" className="num text-[12px]">
                      {item.quantityOrdered}
                    </TD>
                    <TD align="right" className="num text-[12px]">
                      <span className={item.quantityReceived >= item.quantityOrdered ? "text-emerald-700" : "text-muted"}>
                        {item.quantityReceived}
                      </span>
                    </TD>
                    <TD align="right" className="num text-[12px]">
                      {currency(item.unitCost, detail.data!.currencyCode)}
                    </TD>
                    <TD align="right" className="num text-[12.5px] font-medium">
                      {currency(item.lineTotal, detail.data!.currencyCode)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-[#faf9f5] p-3">
                <InfoRow label="Subtotal" value={currency(detail.data.subtotal, detail.data.currencyCode)} />
                <InfoRow label="Tax" value={currency(detail.data.taxTotal, detail.data.currencyCode)} />
                <InfoRow label="Total" value={currency(detail.data.total, detail.data.currencyCode)} />
                <InfoRow label="Paid" value={currency(detail.data.amountPaid, detail.data.currencyCode)} />
              </div>
              <div className="rounded-lg border border-line bg-[#faf9f5] p-3">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Receipts</p>
                {detail.data.receipts.length === 0 ? (
                  <p className="mt-2 text-[11.5px] text-muted">Nothing received yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {detail.data.receipts.map((receipt) => (
                      <li key={receipt.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                        <span className="text-ink-soft">{dateTime(receipt.receivedAtUtc)}</span>
                        <span className="truncate text-[10.5px] text-muted">{receipt.notes ?? "Goods receipt"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {detail.data.notes && (
              <p className="rounded-lg border border-dashed border-line-strong px-3 py-2 text-[11.5px] leading-relaxed text-muted">
                {detail.data.notes}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New purchase order"
        description="Line totals are calculated from quantity and unit cost."
        size="xl"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)} disabled={createBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="truck" loading={createBusy} onClick={() => void createOrder()}>
              Create purchase order
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Supplier" required>
              <Select
                value={createForm.supplierId}
                onChange={(event) => setCreateForm({ ...createForm, supplierId: event.target.value })}
              >
                <option value="">Choose a supplier</option>
                {supplierList.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expected date">
              <Input
                type="date"
                value={createForm.expectedDate}
                onChange={(event) => setCreateForm({ ...createForm, expectedDate: event.target.value })}
              />
            </Field>
            <Field label="Tax total">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={createForm.taxTotal}
                onChange={(event) => setCreateForm({ ...createForm, taxTotal: event.target.value })}
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-ink-soft">Line items</p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" icon="alert" onClick={fillLowStockLines}>
                  Prefill low stock
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="plus"
                  onClick={() => setLines([...lines, { variantId: "", quantityOrdered: "1", unitCost: "0" }])}
                >
                  Add line
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-line bg-[#faf9f5] p-2.5 sm:grid-cols-[1fr_90px_110px_36px]">
                  <Select
                    value={line.variantId}
                    onChange={(event) => {
                      const row = variants.find((variant) => variant.variantId === event.target.value);
                      setLines(
                        lines.map((current, currentIndex) =>
                          currentIndex === index
                            ? {
                                ...current,
                                variantId: event.target.value,
                                unitCost: row ? String(row.costPrice) : current.unitCost,
                              }
                            : current,
                        ),
                      );
                    }}
                  >
                    <option value="">Choose a variant</option>
                    {variants.map((variant) => (
                      <option key={variant.variantId} value={variant.variantId}>
                        {variant.productName} · {variant.variantName} · {variant.sku}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    value={line.quantityOrdered}
                    aria-label="Quantity ordered"
                    onChange={(event) =>
                      setLines(
                        lines.map((current, currentIndex) =>
                          currentIndex === index ? { ...current, quantityOrdered: event.target.value } : current,
                        ),
                      )
                    }
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitCost}
                    aria-label="Unit cost"
                    onChange={(event) =>
                      setLines(
                        lines.map((current, currentIndex) =>
                          currentIndex === index ? { ...current, unitCost: event.target.value } : current,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label="Remove line"
                    disabled={lines.length === 1}
                    onClick={() => setLines(lines.filter((_, currentIndex) => currentIndex !== index))}
                    className="flex h-10 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Field label="Notes">
            <Textarea
              value={createForm.notes}
              onChange={(event) => setCreateForm({ ...createForm, notes: event.target.value })}
              rows={2}
              placeholder="Delivery instructions or internal context."
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Receive goods"
        description="Received quantities are added to the selected warehouse as stock."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setReceiveOpen(false)} disabled={receiveBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="warehouse" loading={receiveBusy} onClick={() => void receive()}>
              Receive into stock
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Warehouse" required>
            <Select value={receiveWarehouse} onChange={(event) => setReceiveWarehouse(event.target.value)}>
              {(warehouses.data ?? []).map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </Select>
          </Field>
          <div className="space-y-2">
            {(detail.data?.items ?? []).map((item) => {
              const remaining = item.quantityOrdered - item.quantityReceived;
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-[#faf9f5] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium">{item.productName}</p>
                    <p className="text-[10.5px] text-muted">
                      {item.sku} · {remaining} remaining
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={remaining}
                    value={receiveLines[item.id] ?? ""}
                    onChange={(event) => setReceiveLines({ ...receiveLines, [item.id]: event.target.value })}
                    className="h-8 w-24"
                    aria-label={`Quantity to receive for ${item.productName}`}
                  />
                </div>
              );
            })}
          </div>
          <Field label="Receipt notes">
            <Input
              value={receiveNotes}
              onChange={(event) => setReceiveNotes(event.target.value)}
              placeholder="Delivery note or reference"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={supplierOpen}
        onClose={() => setSupplierOpen(false)}
        title={supplierEditing ? "Edit supplier" : "New supplier"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setSupplierOpen(false)} disabled={supplierBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={supplierBusy} onClick={() => void saveSupplier()}>
              {supplierEditing ? "Save changes" : "Create supplier"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Supplier name" required>
            <Input
              value={supplierForm.name}
              onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })}
              placeholder="Northwind Wholesale"
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact name">
              <Input
                value={supplierForm.contactName}
                onChange={(event) => setSupplierForm({ ...supplierForm, contactName: event.target.value })}
                placeholder="Purchasing contact"
              />
            </Field>
            <Field label="Status">
              <Select
                value={supplierForm.isActive ? "active" : "inactive"}
                onChange={(event) => setSupplierForm({ ...supplierForm, isActive: event.target.value === "active" })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input
                type="email"
                value={supplierForm.email}
                onChange={(event) => setSupplierForm({ ...supplierForm, email: event.target.value })}
                placeholder="orders@supplier.com"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={supplierForm.phone}
                onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })}
                placeholder="+1 555 0100"
              />
            </Field>
          </div>
          <Field label="Address">
            <Input
              value={supplierForm.address}
              onChange={(event) => setSupplierForm({ ...supplierForm, address: event.target.value })}
              placeholder="Street, city, country"
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={supplierForm.notes}
              onChange={(event) => setSupplierForm({ ...supplierForm, notes: event.target.value })}
              rows={2}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record supplier payment"
        description="Outgoing payments reduce payables and appear in finance."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPayOpen(false)} disabled={payBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="wallet" loading={payBusy} onClick={() => void paySupplier()}>
              Record payment
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplier" required>
              <Select value={payForm.supplierId} onChange={(event) => setPayForm({ ...payForm, supplierId: event.target.value })}>
                <option value="">Choose a supplier</option>
                {supplierList.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Purchase order" hint="Leave as general if the payment covers multiple POs.">
              <Select
                value={payForm.purchaseOrderId}
                onChange={(event) => setPayForm({ ...payForm, purchaseOrderId: event.target.value })}
              >
                <option value="">General payment</option>
                {(orders.data?.items ?? []).map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.poNumber} · {order.supplierName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount" required>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={payForm.amount}
                onChange={(event) => setPayForm({ ...payForm, amount: event.target.value })}
                required
              />
            </Field>
            <Field label="Method">
              <Select value={payForm.method} onChange={(event) => setPayForm({ ...payForm, method: event.target.value })}>
                {methods.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reference">
              <Input
                value={payForm.reference}
                onChange={(event) => setPayForm({ ...payForm, reference: event.target.value })}
                placeholder="Bank reference"
              />
            </Field>
            <Field label="Paid date" hint="Defaults to now when blank.">
              <Input
                type="date"
                value={payForm.paidAt}
                onChange={(event) => setPayForm({ ...payForm, paidAt: event.target.value })}
              />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(supplierView)}
        onClose={() => setSupplierView(null)}
        title={supplierView?.name ?? "Supplier"}
        description={supplierView?.contactName ?? "Supplier profile"}
        size="lg"
        footer={
          supplierView ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setSupplierView(null)}>
                Close
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon="wallet"
                onClick={() => {
                  const target = supplierView;
                  setSupplierView(null);
                  setPayForm({
                    supplierId: target.id,
                    purchaseOrderId: "",
                    amount: "",
                    method: "bank",
                    reference: "",
                    paidAt: "",
                  });
                  setPayOpen(true);
                }}
              >
                Pay supplier
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon="plus"
                onClick={() => {
                  const target = supplierView;
                  setSupplierView(null);
                  setCreateForm({ supplierId: target.id, expectedDate: "", taxTotal: "0", notes: "" });
                  setLines([{ variantId: "", quantityOrdered: "1", unitCost: "0" }]);
                  setCreateOpen(true);
                }}
              >
                New PO
              </Button>
            </>
          ) : undefined
        }
      >
        {supplierView && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-[#faf9f5] p-3">
                <InfoRow label="Email" value={supplierView.email ?? "—"} />
                <InfoRow label="Phone" value={supplierView.phone ?? "—"} />
                <InfoRow label="Address" value={supplierView.address ?? "—"} />
              </div>
              <div className="rounded-lg border border-line bg-[#faf9f5] p-3">
                <InfoRow label="Open POs" value={number(supplierView.openPurchaseOrders)} />
                <InfoRow label="Total purchased" value={currency(supplierView.totalPurchased)} />
                <InfoRow label="Status" value={supplierView.isActive ? "Active" : "Inactive"} />
              </div>
            </div>
            {supplierView.notes && (
              <p className="rounded-lg border border-line bg-[#faf9f5] p-3 text-xs text-muted">
                {supplierView.notes}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(supplierDelete)}
        onClose={() => setSupplierDelete(null)}
        onConfirm={() => void deleteSupplier()}
        title={`Remove ${supplierDelete?.name ?? "this supplier"}?`}
        description="Suppliers with existing purchase orders cannot be deleted; mark them inactive instead."
        confirmLabel="Remove supplier"
        loading={deleteBusy}
      />

      <div className="flex items-center gap-2 text-[10.5px] text-muted">
        <Icon name="shield" size={11} />
        Receiving goods writes immutable stock movements and is restricted to managers.
      </div>
    </div>
  );
}
