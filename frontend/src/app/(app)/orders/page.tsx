"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { query, type Paged } from "@/lib/api";
import { useApi, useDebounced } from "@/lib/hooks";
import { downloadCsvRows } from "@/lib/csv";
import type { OrderListItem } from "@/lib/types";
import { currency, dateTime, number } from "@/lib/format";
import { NewOrderModal } from "@/components/NewOrderModal";
import { Icon } from "@/components/icons";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
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
} from "@/components/ui";

export default function OrdersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("status")) setStatus(params.get("status") ?? "");
    if (params.get("paymentStatus")) setPaymentStatus(params.get("paymentStatus") ?? "");
    if (params.get("customerId")) setCustomerId(params.get("customerId") ?? "");
    if (params.get("new") === "1") setNewOpen(true);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, paymentStatus, customerId, from, to]);

  const orders = useApi<Paged<OrderListItem>>(
    `/api/v1/orders${query({
      search: debouncedSearch,
      status,
      paymentStatus,
      customerId,
      from,
      to,
      page,
      pageSize: 12,
    })}`,
  );
  const pending = useApi<Paged<OrderListItem>>("/api/v1/orders?status=Pending&pageSize=1");
  const unpaid = useApi<Paged<OrderListItem>>("/api/v1/orders?paymentStatus=Unpaid&pageSize=1");
  const paid = useApi<Paged<OrderListItem>>("/api/v1/orders?paymentStatus=Paid&pageSize=1");

  const stats = [
    { label: "All orders", value: orders.data?.totalCount ?? 0, accent: "text-ink", hint: "In this workspace" },
    { label: "Pending", value: pending.data?.totalCount ?? 0, accent: "text-amber-600", hint: "Awaiting confirmation" },
    { label: "Unpaid", value: unpaid.data?.totalCount ?? 0, accent: "text-rose-600", hint: "Outstanding balance" },
    { label: "Paid", value: paid.data?.totalCount ?? 0, accent: "text-emerald-700", hint: "Settled in full" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Orders"
        description="Track the full order lifecycle from pending to delivered, with payments and returns attached."
      >
        <Button
          variant="secondary"
          icon="download"
          disabled={!orders.data || orders.data.items.length === 0}
          onClick={() => {
            if (!orders.data) return;
            downloadCsvRows(
              "orders.csv",
              ["OrderNumber", "Customer", "Email", "Status", "PaymentStatus", "Fulfillment", "Items", "Total", "Currency", "PlacedAtUtc"],
              orders.data.items.map((o) => [
                o.orderNumber,
                o.customerName,
                o.customerEmail ?? "",
                o.status,
                o.paymentStatus,
                o.fulfillmentStatus,
                o.itemCount,
                o.grandTotal.toFixed(2),
                o.currencyCode,
                o.placedAtUtc,
              ]),
            );
          }}
        >
          Export CSV
        </Button>
        <Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>
          New order
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="px-4 py-3.5">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{stat.label}</p>
            <p className={cn("num mt-1 text-xl font-semibold leading-none", stat.accent)}>{number(stat.value)}</p>
            <p className="mt-1 text-[10px] text-muted">{stat.hint}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3.5 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search order number, customer or email…"
            className="w-full lg:max-w-[320px]"
          />
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-[150px]">
              <option value="">Any status</option>
              {["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled", "Returned", "Refunded"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ),
              )}
            </Select>
            <Select
              value={paymentStatus}
              onChange={(event) => setPaymentStatus(event.target.value)}
              className="w-[160px]"
            >
              <option value="">Any payment</option>
              {["Unpaid", "Partial", "Paid", "Refunded"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
            {(status || paymentStatus || customerId || from || to) && (
              <Button
                variant="ghost"
                size="sm"
                icon="close"
                onClick={() => {
                  setStatus("");
                  setPaymentStatus("");
                  setCustomerId("");
                  setFrom("");
                  setTo("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[#faf9f5] px-3.5 py-2.5 text-[11px] text-muted">
          <span>Date range:</span>
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-8 w-[140px] text-xs"
            aria-label="From date"
          />
          <span>to</span>
          <Input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-8 w-[140px] text-xs"
            aria-label="To date"
          />
        </div>

        {orders.loading ? (
          <TableSkeleton rows={8} columns={7} />
        ) : orders.error ? (
          <ErrorState message={orders.error.message} onRetry={orders.reload} />
        ) : !orders.data || orders.data.items.length === 0 ? (
          <EmptyState
            icon="orders"
            title="No orders found"
            description="Adjust the filters or create a new order to get started."
            action={
              <Button variant="primary" size="sm" icon="plus" onClick={() => setNewOpen(true)}>
                New order
              </Button>
            }
          />
        ) : (
          <Table className="min-w-[860px]">
            <THead>
              <tr>
                <TH>Order</TH>
                <TH>Customer</TH>
                <TH>Placed</TH>
                <TH align="right">Items</TH>
                <TH align="right">Total</TH>
                <TH>Payment</TH>
                <TH>Status</TH>
                <TH align="right"></TH>
              </tr>
            </THead>
            <tbody>
              {orders.data.items.map((order) => (
                <TR key={order.id} onClick={() => router.push(`/orders/${order.id}`)}>
                  <TD>
                    <p className="font-mono text-[11.5px] font-medium text-ink">{order.orderNumber}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{order.fulfillmentStatus}</p>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Avatar name={order.customerName} size={26} />
                      <div className="min-w-0">
                        <p className="max-w-[180px] truncate text-[12px] font-medium text-ink">{order.customerName}</p>
                        <p className="max-w-[180px] truncate text-[10px] text-muted">{order.customerEmail ?? "—"}</p>
                      </div>
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-[11px] text-muted">{dateTime(order.placedAtUtc)}</TD>
                  <TD align="right" className="num text-[12px] text-ink-soft">
                    {order.itemCount}
                  </TD>
                  <TD align="right" className="num text-[12.5px] font-medium">
                    {currency(order.grandTotal, order.currencyCode)}
                  </TD>
                  <TD>
                    <StatusBadge status={order.paymentStatus} />
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
            label="orders"
            onPage={setPage}
          />
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-4 text-[10.5px] text-muted">
        <Badge tone="zinc">Payment status is derived from recorded payments</Badge>
        <span className="flex items-center gap-1.5">
          <Icon name="shield" size={11} /> Confirming an order reserves stock and issues an invoice
        </span>
      </div>

      <NewOrderModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(order) => {
          setNewOpen(false);
          router.push(`/orders/${order.id}`);
        }}
      />
    </div>
  );
}
