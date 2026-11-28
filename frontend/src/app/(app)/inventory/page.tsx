"use client";

import { useEffect, useMemo, useState } from "react";
import { api, query, type Paged } from "@/lib/api";
import { errorMessage, useApi, useDebounced } from "@/lib/hooks";
import type { StockMovement, StockReportRow, StockRow, Warehouse } from "@/lib/types";
import { currency, dateTime, number, statusLabel } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableSkeleton,
  Tabs,
  Textarea,
  cn,
  useToast,
} from "@/components/ui";
import { ProgressBar } from "@/components/charts";
import { useAuth } from "@/components/AuthProvider";

const movementTone: Record<string, string> = {
  PurchaseReceipt: "emerald",
  Sale: "blue",
  Return: "violet",
  Adjustment: "amber",
  TransferIn: "indigo",
  TransferOut: "indigo",
  Reservation: "zinc",
  Release: "zinc",
};

export default function InventoryPage() {
  const { session } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState("stock");
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [movementType, setMovementType] = useState("");
  const [movementVariantId, setMovementVariantId] = useState("");
  const [movementPage, setMovementPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [warehouseEditing, setWarehouseEditing] = useState<Warehouse | null>(null);
  const [warehouseDelete, setWarehouseDelete] = useState<Warehouse | null>(null);
  const [reorderTarget, setReorderTarget] = useState<StockRow | null>(null);
  const [reorderForm, setReorderForm] = useState({ reorderPoint: "0", reorderQuantity: "0" });
  const [busy, setBusy] = useState(false);

  const [adjustForm, setAdjustForm] = useState({
    variantId: "",
    warehouseId: "",
    direction: "add",
    quantity: "10",
    note: "",
  });
  const [transferForm, setTransferForm] = useState({
    variantId: "",
    fromWarehouseId: "",
    toWarehouseId: "",
    quantity: "10",
    note: "",
  });
  const [warehouseForm, setWarehouseForm] = useState({
    name: "",
    code: "",
    address: "",
    isDefault: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const term = params.get("search");
    if (term) setSearch(term);
    if (params.get("lowStock") === "1") {
      setLowOnly(true);
      setTab("stock");
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, warehouseId, lowOnly]);

  useEffect(() => {
    setMovementPage(1);
  }, [movementType, movementVariantId, warehouseId]);

  const stockPath = `/api/v1/inventory/stock${query({
    search: debouncedSearch,
    warehouseId,
    lowStock: lowOnly,
    page,
    pageSize: 12,
  })}`;
  const stock = useApi<Paged<StockRow>>(stockPath);
  const allStock = useApi<Paged<StockRow>>("/api/v1/inventory/stock?pageSize=200");
  const warehouses = useApi<Warehouse[]>("/api/v1/warehouses");
  const movements = useApi<Paged<StockMovement>>(
    `/api/v1/inventory/movements${query({
      variantId: movementVariantId,
      warehouseId,
      type: movementType,
      page: movementPage,
      pageSize: 15,
    })}`,
  );
  const stockReport = useApi<StockReportRow[]>("/api/v1/reports/stock");

  const lowStockRows = useMemo(
    () => (stockReport.data ?? []).filter((row) => row.lowStock),
    [stockReport.data],
  );
  const stockValue = useMemo(
    () => (stockReport.data ?? []).reduce((sum, row) => sum + row.stockValue, 0),
    [stockReport.data],
  );
  const unitsOnHand = (warehouses.data ?? []).reduce((sum, warehouse) => sum + warehouse.unitsOnHand, 0);
  const currencyCode = session?.user.currencyCode ?? "USD";
  const canManage = ["Owner", "Admin", "Manager"].includes(session?.user.role ?? "");
  const canAdjust = canManage || session?.user.role === "Staff";

  const uniqueVariants = useMemo(() => {
    const map = new Map<string, StockRow>();
    (allStock.data?.items ?? []).forEach((row) => {
      if (!map.has(row.variantId)) map.set(row.variantId, row);
    });
    return [...map.values()];
  }, [allStock.data]);

  function openAdjust(row?: StockRow) {
    setAdjustForm({
      variantId: row?.variantId ?? uniqueVariants[0]?.variantId ?? "",
      warehouseId: row?.warehouseId ?? warehouses.data?.[0]?.id ?? "",
      direction: "add",
      quantity: "10",
      note: "",
    });
    setAdjustOpen(true);
  }

  function openTransfer(row?: StockRow) {
    setTransferForm({
      variantId: row?.variantId ?? uniqueVariants[0]?.variantId ?? "",
      fromWarehouseId: row?.warehouseId ?? warehouses.data?.[0]?.id ?? "",
      toWarehouseId: warehouses.data?.find((warehouse) => warehouse.id !== (row?.warehouseId ?? warehouses.data?.[0]?.id))?.id ?? "",
      quantity: "10",
      note: "",
    });
    setTransferOpen(true);
  }

  async function refreshAll() {
    await Promise.all([stock.reload(), allStock.reload(), movements.reload(), stockReport.reload()]);
  }

  async function submitAdjust() {
    const quantity = Number(adjustForm.quantity);
    if (!adjustForm.variantId || !adjustForm.warehouseId || !quantity || quantity <= 0) {
      push({ tone: "error", title: "Choose a variant, warehouse and positive quantity." });
      return;
    }
    setBusy(true);
    try {
      await api("/api/v1/inventory/adjust", {
        method: "POST",
        body: {
          warehouseId: adjustForm.warehouseId,
          variantId: adjustForm.variantId,
          quantityDelta: adjustForm.direction === "add" ? quantity : -quantity,
          note: adjustForm.note || null,
        },
      });
      push({
        title: "Stock adjusted",
        description: `${adjustForm.direction === "add" ? "+" : "−"}${quantity} units recorded as an immutable movement.`,
      });
      setAdjustOpen(false);
      await refreshAll();
    } catch (cause) {
      push({ tone: "error", title: "Adjustment failed", description: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function submitTransfer() {
    const quantity = Number(transferForm.quantity);
    if (
      !transferForm.variantId ||
      !transferForm.fromWarehouseId ||
      !transferForm.toWarehouseId ||
      transferForm.fromWarehouseId === transferForm.toWarehouseId ||
      !quantity ||
      quantity <= 0
    ) {
      push({ tone: "error", title: "Choose two different warehouses and a positive quantity." });
      return;
    }
    setBusy(true);
    try {
      await api("/api/v1/inventory/transfer", {
        method: "POST",
        body: {
          fromWarehouseId: transferForm.fromWarehouseId,
          toWarehouseId: transferForm.toWarehouseId,
          variantId: transferForm.variantId,
          quantity,
          note: transferForm.note || null,
        },
      });
      push({ title: "Transfer complete", description: `${quantity} units moved between warehouses.` });
      setTransferOpen(false);
      await refreshAll();
    } catch (cause) {
      push({ tone: "error", title: "Transfer failed", description: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setBusy(false);
    }
  }

  function openWarehouse(warehouse?: Warehouse) {
    if (warehouse) {
      setWarehouseEditing(warehouse);
      setWarehouseForm({
        name: warehouse.name,
        code: warehouse.code,
        address: warehouse.address ?? "",
        isDefault: warehouse.isDefault,
      });
    } else {
      setWarehouseEditing(null);
      setWarehouseForm({ name: "", code: "", address: "", isDefault: false });
    }
    setWarehouseOpen(true);
  }

  async function submitWarehouse() {
    if (!warehouseForm.name.trim() || !warehouseForm.code.trim()) {
      push({ tone: "error", title: "Warehouse name and code are required." });
      return;
    }
    setBusy(true);
    try {
      await api(warehouseEditing ? `/api/v1/warehouses/${warehouseEditing.id}` : "/api/v1/warehouses", {
        method: warehouseEditing ? "PUT" : "POST",
        body: {
          name: warehouseForm.name.trim(),
          code: warehouseForm.code.trim().toUpperCase(),
          address: warehouseForm.address.trim() || null,
          isDefault: warehouseForm.isDefault,
        },
      });
      push({ title: warehouseEditing ? "Warehouse updated" : "Warehouse created" });
      setWarehouseOpen(false);
      setWarehouseEditing(null);
      setWarehouseForm({ name: "", code: "", address: "", isDefault: false });
      await warehouses.reload();
    } catch (cause) {
      push({ tone: "error", title: "Could not save warehouse", description: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteWarehouse() {
    if (!warehouseDelete) return;
    setBusy(true);
    try {
      await api(`/api/v1/warehouses/${warehouseDelete.id}`, { method: "DELETE" });
      push({ title: "Warehouse deleted" });
      setWarehouseDelete(null);
      await warehouses.reload();
    } catch (cause) {
      push({ tone: "error", title: "Could not delete warehouse", description: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  function openReorder(row: StockRow) {
    setReorderTarget(row);
    setReorderForm({
      reorderPoint: String(row.reorderPoint),
      reorderQuantity: String(row.reorderQuantity),
    });
  }

  async function submitReorder() {
    if (!reorderTarget) return;
    const reorderPoint = Math.max(0, Number(reorderForm.reorderPoint) || 0);
    const reorderQuantity = Math.max(0, Number(reorderForm.reorderQuantity) || 0);
    setBusy(true);
    try {
      await api("/api/v1/inventory/reorder", {
        method: "PUT",
        body: {
          warehouseId: reorderTarget.warehouseId,
          variantId: reorderTarget.variantId,
          reorderPoint,
          reorderQuantity,
        },
      });
      push({ title: "Reorder thresholds updated" });
      setReorderTarget(null);
      await refreshAll();
    } catch (cause) {
      push({ tone: "error", title: "Could not update reorder settings", description: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  const activeVariant = uniqueVariants.find((variant) => variant.variantId === adjustForm.variantId);
  const onHandForSelection = allStock.data?.items.find(
    (row) => row.variantId === adjustForm.variantId && row.warehouseId === adjustForm.warehouseId,
  )?.onHand;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalog"
        title="Inventory"
        description="Stock levels, movements and warehouses — scoped to this workspace and tenant."
      >
        {canManage && (
          <Button variant="secondary" icon="plus" onClick={() => openWarehouse()}>
            New warehouse
          </Button>
        )}
        {canManage && warehouses.data && warehouses.data.length > 1 && (
          <Button variant="secondary" icon="refresh" onClick={() => openTransfer()}>
            Transfer
          </Button>
        )}
        {canAdjust && (
          <Button variant="primary" icon="edit" onClick={() => openAdjust()}>
            Adjust stock
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Units on hand", value: number(unitsOnHand), hint: `${warehouses.data?.length ?? 0} warehouse(s)`, icon: "warehouse" as const },
          { label: "Tracked variants", value: number(stockReport.data?.length ?? 0), hint: "Across all products", icon: "layers" as const },
          { label: "Low stock", value: number(lowStockRows.length), hint: "At or below reorder point", icon: "alert" as const, tone: "amber" as const },
          { label: "Stock value", value: currency(stockValue, currencyCode), hint: "At cost price", icon: "wallet" as const },
        ].map((stat) => (
          <Card key={stat.label} className="flex items-center gap-3 px-4 py-3.5">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border",
                stat.tone === "amber"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-[#cfe2d6] bg-brand-soft text-brand",
              )}
            >
              <Icon name={stat.icon} size={15} />
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{stat.label}</p>
              <p className="num mt-0.5 truncate text-lg font-semibold leading-none">{stat.value}</p>
              <p className="mt-0.5 truncate text-[10px] text-muted">{stat.hint}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "stock", label: "Stock levels", count: stock.data?.totalCount },
            { value: "movements", label: "Movements", count: movements.data?.totalCount },
            { value: "warehouses", label: "Warehouses", count: warehouses.data?.length },
          ]}
        />
        <div className="text-[10.5px] text-muted">
          {lowOnly ? (
            <button
              type="button"
              onClick={() => setLowOnly(false)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-medium text-amber-700"
            >
              Low stock only <Icon name="close" size={11} />
            </button>
          ) : (
            <span className="flex items-center gap-1.5">
              <Icon name="shield" size={11} /> Movements are immutable
            </span>
          )}
        </div>
      </div>

      {tab === "stock" && (
        <Card>
          <div className="flex flex-col gap-3 border-b border-line p-3.5 lg:flex-row lg:items-center">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search product or SKU…"
              className="w-full lg:max-w-[280px]"
            />
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <Select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="w-[160px]">
                <option value="">All warehouses</option>
                {(warehouses.data ?? []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => setLowOnly((value) => !value)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
                  lowOnly
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-line bg-surface text-muted hover:text-ink",
                )}
              >
                <Icon name="alert" size={13} /> Low stock
              </button>
            </div>
          </div>

          {stock.loading ? (
            <TableSkeleton rows={8} columns={6} />
          ) : stock.error ? (
            <ErrorState message={stock.error.message} onRetry={stock.reload} />
          ) : !stock.data || stock.data.items.length === 0 ? (
            <EmptyState
              icon="warehouse"
              title={lowOnly ? "No low-stock items" : "No stock records"}
              description={
                lowOnly
                  ? "Every tracked variant is above its reorder point."
                  : "Create products and adjust stock to start tracking inventory."
              }
            />
          ) : (
            <Table className="min-w-[860px]">
              <THead>
                <tr>
                  <TH>Product</TH>
                  <TH>Warehouse</TH>
                  <TH align="right">On hand</TH>
                  <TH align="right">Reserved</TH>
                  <TH align="right">Available</TH>
                  <TH>Reorder</TH>
                  <TH align="right">Cost value</TH>
                  <TH align="right"></TH>
                </tr>
              </THead>
              <tbody>
                {stock.data.items.map((row) => {
                  const low = row.available <= row.reorderPoint;
                  return (
                    <TR key={`${row.variantId}-${row.warehouseId}`}>
                      <TD>
                        <p className="text-[12.5px] font-medium text-ink">{row.productName}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted">
                          {row.sku} · {row.variantName}
                        </p>
                      </TD>
                      <TD className="text-[12px] text-muted">{row.warehouseName}</TD>
                      <TD align="right" className="num text-[12px] font-medium">
                        {number(row.onHand)}
                      </TD>
                      <TD align="right" className="num text-[12px] text-muted">
                        {number(row.reserved)}
                      </TD>
                      <TD align="right">
                        <span className={cn("num text-[12px] font-medium", low ? "text-rose-600" : "text-ink")}>
                          {number(row.available)}
                        </span>
                      </TD>
                      <TD>
                        <div className="w-[92px]">
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span className="num text-muted">{row.reorderPoint}</span>
                            {low ? <Badge tone="rose">Low</Badge> : <span className="text-emerald-600">OK</span>}
                          </div>
                          <ProgressBar
                            value={row.available}
                            max={Math.max(row.reorderPoint * 3, row.available, 1)}
                            tone={low ? "rose" : "brand"}
                            className="mt-1.5"
                          />
                        </div>
                      </TD>
                      <TD align="right" className="num text-[12px]">
                        {currency(row.onHand * row.costPrice, currencyCode)}
                      </TD>
                      <TD align="right">
                        <div className="flex justify-end gap-1">
                          {canAdjust && (
                            <Button variant="ghost" size="sm" onClick={() => openAdjust(row)}>
                              Adjust
                            </Button>
                          )}
                          {canManage && warehouses.data && warehouses.data.length > 1 && (
                            <Button variant="ghost" size="sm" onClick={() => openTransfer(row)}>
                              Transfer
                            </Button>
                          )}
                          {canManage && (
                            <Button variant="ghost" size="sm" onClick={() => openReorder(row)}>
                              Reorder
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
          {stock.data && !stock.loading && !stock.error && (
            <Pagination
              page={stock.data.page}
              totalPages={stock.data.totalPages}
              totalCount={stock.data.totalCount}
              pageSize={stock.data.pageSize}
              label="stock records"
              onPage={setPage}
            />
          )}
        </Card>
      )}

      {tab === "movements" && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3.5">
            <Select
              value={movementType}
              onChange={(event) => setMovementType(event.target.value)}
              className="w-[180px]"
            >
              <option value="">All movement types</option>
              {["Adjustment", "TransferIn", "TransferOut", "PurchaseReceipt", "Sale", "Return", "Reservation", "Release"].map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </Select>
            <Select
              value={movementVariantId}
              onChange={(event) => setMovementVariantId(event.target.value)}
              className="w-[210px]"
            >
              <option value="">All variants</option>
              {uniqueVariants.map((variant) => (
                <option key={variant.variantId} value={variant.variantId}>
                  {variant.productName} · {variant.sku}
                </option>
              ))}
            </Select>
            <Select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="w-[170px]">
              <option value="">All warehouses</option>
              {(warehouses.data ?? []).map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </Select>
            <span className="ml-auto text-[10.5px] text-muted">
              Every quantity change is recorded with a balance snapshot.
            </span>
          </div>
          {movements.loading ? (
            <TableSkeleton rows={8} columns={5} />
          ) : movements.error ? (
            <ErrorState message={movements.error.message} onRetry={movements.reload} />
          ) : !movements.data || movements.data.items.length === 0 ? (
            <EmptyState icon="layers" title="No stock movements" description="Adjustments, sales and receipts will appear here." />
          ) : (
            <Table className="min-w-[780px]">
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>Product</TH>
                  <TH>Warehouse</TH>
                  <TH>Type</TH>
                  <TH align="right">Change</TH>
                  <TH align="right">Balance</TH>
                  <TH>Reference</TH>
                </tr>
              </THead>
              <tbody>
                {movements.data.items.map((movement) => (
                  <TR key={movement.id}>
                    <TD className="whitespace-nowrap text-[11px] text-muted">{dateTime(movement.createdAtUtc)}</TD>
                    <TD>
                      <p className="text-[12px] font-medium">{movement.productName}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted">{movement.sku}</p>
                    </TD>
                    <TD className="text-[11.5px] text-muted">{movement.warehouseName}</TD>
                    <TD>
                      <Badge tone={movementTone[movement.type] ?? "zinc"} dot>
                        {statusLabel(movement.type)}
                      </Badge>
                    </TD>
                    <TD align="right">
                      <span className={cn("num text-[12px] font-medium", movement.quantity >= 0 ? "text-emerald-700" : "text-rose-600")}>
                        {movement.quantity >= 0 ? "+" : ""}
                        {number(movement.quantity)}
                      </span>
                    </TD>
                    <TD align="right" className="num text-[12px] text-ink-soft">
                      {number(movement.balanceAfter)}
                    </TD>
                    <TD className="max-w-[180px]">
                      <p className="truncate text-[11px] text-ink-soft">{movement.reference ?? "—"}</p>
                      {movement.note && <p className="mt-0.5 truncate text-[10px] text-muted">{movement.note}</p>}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
          {movements.data && !movements.loading && !movements.error && (
            <Pagination
              page={movements.data.page}
              totalPages={movements.data.totalPages}
              totalCount={movements.data.totalCount}
              pageSize={movements.data.pageSize}
              label="movements"
              onPage={setMovementPage}
            />
          )}
        </Card>
      )}

      {tab === "warehouses" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {warehouses.loading && Array.from({ length: 2 }).map((_, index) => <Card key={index} className="h-[180px]" />)}
          {(warehouses.data ?? []).map((warehouse) => (
            <Card key={warehouse.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#cfe2d6] bg-brand-soft text-brand">
                  <Icon name="warehouse" size={17} />
                </span>
                <div className="flex items-center gap-1">
                  {warehouse.isDefault && <Badge tone="brand">Default</Badge>}
                  {canManage && (
                    <>
                      <Button variant="ghost" size="sm" icon="edit" onClick={() => openWarehouse(warehouse)}>
                        Edit
                      </Button>
                      {!warehouse.isDefault && (
                        <button
                          type="button"
                          aria-label={`Delete ${warehouse.name}`}
                          onClick={() => setWarehouseDelete(warehouse)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <h3 className="mt-3 text-[13px] font-semibold">{warehouse.name}</h3>
              <p className="mt-0.5 font-mono text-[10px] text-muted">{warehouse.code}</p>
              <p className="mt-2 min-h-[16px] text-[11px] text-muted">{warehouse.address || "No address recorded"}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3">
                <div>
                  <p className="num text-[15px] font-semibold">{number(warehouse.unitsOnHand)}</p>
                  <p className="text-[10px] text-muted">Units on hand</p>
                </div>
                <div>
                  <p className="num text-[15px] font-semibold">{number(warehouse.variantCount)}</p>
                  <p className="text-[10px] text-muted">Variants tracked</p>
                </div>
              </div>
            </Card>
          ))}
          {warehouses.data && warehouses.data.length === 0 && (
            <Card className="md:col-span-2 xl:col-span-3">
              <EmptyState
                icon="warehouse"
                title="No warehouses yet"
                description="Create a warehouse to start tracking stock in a physical location."
                action={
                  canManage ? (
                    <Button variant="primary" size="sm" icon="plus" onClick={() => setWarehouseOpen(true)}>
                      New warehouse
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          )}
        </div>
      )}

      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Adjust stock"
        description="Records an immutable movement. Use negative removal via the Remove option."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAdjustOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submitAdjust} loading={busy}>
              Record adjustment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Variant" required>
            <Select
              value={adjustForm.variantId}
              onChange={(event) => setAdjustForm({ ...adjustForm, variantId: event.target.value })}
            >
              <option value="">Select a variant</option>
              {uniqueVariants.map((variant) => (
                <option key={variant.variantId} value={variant.variantId}>
                  {variant.productName} · {variant.sku}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Warehouse" required>
            <Select
              value={adjustForm.warehouseId}
              onChange={(event) => setAdjustForm({ ...adjustForm, warehouseId: event.target.value })}
            >
              <option value="">Select a warehouse</option>
              {(warehouses.data ?? []).map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Direction">
              <div className="flex rounded-lg border border-line bg-[#f3f1ea] p-0.5">
                {(["add", "remove"] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    onClick={() => setAdjustForm({ ...adjustForm, direction })}
                    className={cn(
                      "flex-1 rounded-md py-1.5 text-[11px] font-medium capitalize transition-colors",
                      adjustForm.direction === direction
                        ? "bg-surface text-ink shadow-sm"
                        : "text-muted hover:text-ink-soft",
                    )}
                  >
                    {direction}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Quantity" required>
              <Input
                type="number"
                min="1"
                step="1"
                value={adjustForm.quantity}
                onChange={(event) => setAdjustForm({ ...adjustForm, quantity: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Note">
            <Textarea
              value={adjustForm.note}
              onChange={(event) => setAdjustForm({ ...adjustForm, note: event.target.value })}
              placeholder="Cycle count correction, damaged unit…"
              className="min-h-[70px]"
            />
          </Field>
          {activeVariant && (
            <div className="rounded-lg bg-[#faf9f5] px-3 py-2 text-[11px] text-muted">
              Current on hand at this warehouse:{" "}
              <span className="num font-medium text-ink-soft">{onHandForSelection ?? 0}</span>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Transfer stock"
        description="Move units between warehouses. Both sides are recorded as movements."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setTransferOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submitTransfer} loading={busy}>
              Transfer stock
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Variant" required>
            <Select
              value={transferForm.variantId}
              onChange={(event) => setTransferForm({ ...transferForm, variantId: event.target.value })}
            >
              <option value="">Select a variant</option>
              {uniqueVariants.map((variant) => (
                <option key={variant.variantId} value={variant.variantId}>
                  {variant.productName} · {variant.sku}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From warehouse" required>
              <Select
                value={transferForm.fromWarehouseId}
                onChange={(event) => setTransferForm({ ...transferForm, fromWarehouseId: event.target.value })}
              >
                <option value="">Select</option>
                {(warehouses.data ?? []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To warehouse" required>
              <Select
                value={transferForm.toWarehouseId}
                onChange={(event) => setTransferForm({ ...transferForm, toWarehouseId: event.target.value })}
              >
                <option value="">Select</option>
                {(warehouses.data ?? []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Quantity" required>
            <Input
              type="number"
              min="1"
              step="1"
              value={transferForm.quantity}
              onChange={(event) => setTransferForm({ ...transferForm, quantity: event.target.value })}
            />
          </Field>
          <Field label="Note">
            <Input
              value={transferForm.note}
              onChange={(event) => setTransferForm({ ...transferForm, note: event.target.value })}
              placeholder="Replenishment for storefront"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={warehouseOpen}
        onClose={() => {
          setWarehouseOpen(false);
          setWarehouseEditing(null);
        }}
        title={warehouseEditing ? "Edit warehouse" : "New warehouse"}
        description="Warehouses hold stock items. Each workspace starts with a default location."
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setWarehouseOpen(false);
                setWarehouseEditing(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submitWarehouse} loading={busy}>
              {warehouseEditing ? "Save changes" : "Create warehouse"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input
              value={warehouseForm.name}
              onChange={(event) => setWarehouseForm({ ...warehouseForm, name: event.target.value })}
              placeholder="Secondary warehouse"
            />
          </Field>
          <Field label="Code" required>
            <Input
              value={warehouseForm.code}
              onChange={(event) => setWarehouseForm({ ...warehouseForm, code: event.target.value.toUpperCase() })}
              placeholder="SEC"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Address">
            <Textarea
              value={warehouseForm.address}
              onChange={(event) => setWarehouseForm({ ...warehouseForm, address: event.target.value })}
              placeholder="Street, city, country"
              className="min-h-[70px]"
            />
          </Field>
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={warehouseForm.isDefault}
              onChange={(event) => setWarehouseForm({ ...warehouseForm, isDefault: event.target.checked })}
              className="h-4 w-4 rounded border-line accent-[#1d5d45]"
            />
            Make this the default warehouse
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(reorderTarget)}
        onClose={() => setReorderTarget(null)}
        title="Reorder settings"
        description={reorderTarget ? `${reorderTarget.productName} · ${reorderTarget.sku} (${reorderTarget.warehouseName})` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setReorderTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submitReorder} loading={busy}>
              Save thresholds
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Reorder point" hint="Low-stock alerts trigger when available units fall to or below this number.">
            <Input
              type="number"
              min="0"
              value={reorderForm.reorderPoint}
              onChange={(event) => setReorderForm({ ...reorderForm, reorderPoint: event.target.value })}
            />
          </Field>
          <Field label="Suggested reorder quantity" hint="Default quantity pre-filled when replenishing via purchase orders.">
            <Input
              type="number"
              min="0"
              value={reorderForm.reorderQuantity}
              onChange={(event) => setReorderForm({ ...reorderForm, reorderQuantity: event.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(warehouseDelete)}
        onClose={() => setWarehouseDelete(null)}
        onConfirm={() => void deleteWarehouse()}
        title={`Delete ${warehouseDelete?.name ?? "this warehouse"}?`}
        description="All stock in this warehouse must be transferred or adjusted to zero before it can be removed."
        confirmLabel="Delete warehouse"
        loading={busy}
      />

      {lowStockRows.length > 0 && tab === "stock" && !lowOnly && (
        <Card>
          <CardHeader
            title="Reorder attention"
            description={`${lowStockRows.length} variant(s) at or below their reorder point`}
            action={
              <Button variant="secondary" size="sm" onClick={() => setLowOnly(true)}>
                Filter low stock
              </Button>
            }
          />
          <CardBody className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {lowStockRows.slice(0, 6).map((row) => (
              <div
                key={row.variantId}
                className="flex items-center gap-3 rounded-lg border border-line bg-[#faf9f5] px-3 py-2.5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-600">
                  <Icon name="alert" size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium">{row.productName}</p>
                  <p className="mt-0.5 font-mono text-[9.5px] text-muted">{row.sku}</p>
                </div>
                <div className="text-right">
                  <p className="num text-[11.5px] font-medium text-rose-600">{row.available}</p>
                  <p className="text-[9.5px] text-muted">of {row.reorderPoint}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
