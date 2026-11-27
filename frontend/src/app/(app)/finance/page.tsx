"use client";

import { useEffect, useMemo, useState } from "react";
import { api, query, type Paged } from "@/lib/api";
import { errorMessage, useApi, useDebounced } from "@/lib/hooks";
import type { Expense, FinanceSummary, OrderListItem, Payment, Refund } from "@/lib/types";
import { currency, date, dateTime } from "@/lib/format";
import { BarChart, CHART_COLORS, Donut } from "@/components/charts";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
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
  cn,
  useToast,
} from "@/components/ui";

const methods = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
  { value: "mobile", label: "Mobile money" },
];

export default function FinancePage() {
  const { push } = useToast();
  const [tab, setTab] = useState("payments");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  const filters = { from: from || undefined, to: to || undefined };
  const summary = useApi<FinanceSummary>(`/api/v1/finance/summary${query(filters)}`);
  const payments = useApi<Paged<Payment>>(
    `/api/v1/payments${query({ search: debouncedSearch, method, page, pageSize: 15, ...filters })}`,
  );
  const refunds = useApi<Refund[]>("/api/v1/refunds");
  const expenses = useApi<Expense[]>("/api/v1/expenses");
  const orders = useApi<Paged<OrderListItem>>("/api/v1/orders?pageSize=200");

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    orderId: "",
    amount: "",
    method: "cash",
    reference: "",
    notes: "",
    paidAt: "",
  });
  const [payBusy, setPayBusy] = useState(false);

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundForm, setRefundForm] = useState({ orderId: "", amount: "", reason: "" });
  const [refundBusy, setRefundBusy] = useState(false);

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: "Operations",
    description: "",
    amount: "",
    paidAt: new Date().toISOString().slice(0, 10),
    method: "card",
    reference: "",
  });
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [expenseDelete, setExpenseDelete] = useState<Expense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, method, from, to]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("new");
    if (target === "payment") setPayOpen(true);
    if (target === "expense") setExpenseOpen(true);
  }, []);

  const orderOptions = useMemo(() => orders.data?.items ?? [], [orders.data]);
  const selectedOrder = useMemo(
    () => orderOptions.find((order) => order.id === payForm.orderId),
    [orderOptions, payForm.orderId],
  );

  async function recordPayment() {
    const amount = Number(payForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      push({ tone: "error", title: "Enter a valid payment amount" });
      return;
    }
    setPayBusy(true);
    try {
      await api("/api/v1/payments", {
        method: "POST",
        body: {
          orderId: payForm.orderId || null,
          amount,
          method: payForm.method,
          reference: payForm.reference || null,
          notes: payForm.notes || null,
          paidAtUtc: payForm.paidAt ? new Date(payForm.paidAt).toISOString() : null,
        },
      });
      await Promise.all([summary.reload(), payments.reload(), orders.reload()]);
      push({ title: "Payment recorded" });
      setPayOpen(false);
      setPayForm({ orderId: "", amount: "", method: "cash", reference: "", notes: "", paidAt: "" });
    } catch (cause) {
      push({ tone: "error", title: "Could not record payment", description: errorMessage(cause) });
    } finally {
      setPayBusy(false);
    }
  }

  async function recordRefund() {
    if (!refundForm.orderId) {
      push({ tone: "error", title: "Choose an order" });
      return;
    }
    const amount = Number(refundForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      push({ tone: "error", title: "Enter a valid refund amount" });
      return;
    }
    if (!refundForm.reason.trim()) {
      push({ tone: "error", title: "A reason is required" });
      return;
    }
    setRefundBusy(true);
    try {
      await api("/api/v1/refunds", {
        method: "POST",
        body: { orderId: refundForm.orderId, amount, reason: refundForm.reason.trim() },
      });
      await Promise.all([summary.reload(), refunds.reload(), payments.reload(), orders.reload()]);
      push({ title: "Refund recorded" });
      setRefundOpen(false);
      setRefundForm({ orderId: "", amount: "", reason: "" });
    } catch (cause) {
      push({ tone: "error", title: "Could not record refund", description: errorMessage(cause) });
    } finally {
      setRefundBusy(false);
    }
  }

  async function addExpense() {
    const amount = Number(expenseForm.amount);
    if (!expenseForm.description.trim()) {
      push({ tone: "error", title: "A description is required" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      push({ tone: "error", title: "Enter a valid amount" });
      return;
    }
    setExpenseBusy(true);
    try {
      await api("/api/v1/expenses", {
        method: "POST",
        body: {
          category: expenseForm.category,
          description: expenseForm.description.trim(),
          amount,
          paidAtUtc: new Date(expenseForm.paidAt || new Date().toISOString()).toISOString(),
          method: expenseForm.method,
          reference: expenseForm.reference || null,
        },
      });
      await Promise.all([summary.reload(), expenses.reload()]);
      push({ title: "Expense added" });
      setExpenseOpen(false);
      setExpenseForm({
        category: "Operations",
        description: "",
        amount: "",
        paidAt: new Date().toISOString().slice(0, 10),
        method: "card",
        reference: "",
      });
    } catch (cause) {
      push({ tone: "error", title: "Could not add expense", description: errorMessage(cause) });
    } finally {
      setExpenseBusy(false);
    }
  }

  async function deleteExpense() {
    if (!expenseDelete) return;
    setDeleteBusy(true);
    try {
      await api(`/api/v1/expenses/${expenseDelete.id}`, { method: "DELETE" });
      await Promise.all([summary.reload(), expenses.reload()]);
      push({ title: "Expense deleted" });
      setExpenseDelete(null);
    } catch (cause) {
      push({ tone: "error", title: "Could not delete expense", description: errorMessage(cause) });
    } finally {
      setDeleteBusy(false);
    }
  }

  const methodData = (summary.data?.byMethod ?? []).map((entry, index) => ({
    label: entry.method,
    value: entry.amount,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
  const dailyData = (summary.data?.daily ?? []).map((point) => ({
    label: point.date,
    value: point.revenue,
    secondary: point.expenses,
  }));

  if (summary.loading && !summary.data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-72 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[340px] rounded-xl" />
      </div>
    );
  }

  if (summary.error && !summary.data) {
    return (
      <Card>
        <ErrorState message={summary.error.message} onRetry={summary.reload} />
      </Card>
    );
  }

  const stats = summary.data;
  const statCards = [
    { label: "Revenue", value: stats?.revenue ?? 0, hint: "Payments received", accent: "text-ink", icon: "wallet" as const },
    { label: "Refunds", value: stats?.refunds ?? 0, hint: "Returned to customers", accent: "text-violet-700", icon: "refresh" as const },
    { label: "Expenses", value: stats?.expenses ?? 0, hint: "Recorded operating costs", accent: "text-rose-600", icon: "receipt" as const },
    { label: "Net revenue", value: stats?.netRevenue ?? 0, hint: "Revenue less refunds and expenses", accent: "text-emerald-700", icon: "chart" as const },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Finance"
        description="Cash collected, refunds, operating expenses, receivables and supplier payables — all in the workspace currency."
      >
        <Button
          variant="secondary"
          icon="receipt"
          onClick={() => {
            setTab("expenses");
            setExpenseOpen(true);
          }}
        >
          Add expense
        </Button>
        <Button
          variant="secondary"
          icon="refresh"
          onClick={() => {
            setTab("refunds");
            setRefundOpen(true);
          }}
        >
          Record refund
        </Button>
        <Button variant="primary" icon="wallet" onClick={() => setPayOpen(true)}>
          Record payment
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="px-4 py-3.5">
            <div className="flex items-start justify-between">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{stat.label}</p>
              <Icon name={stat.icon} size={14} className="text-[#b6b9ae]" />
            </div>
            <p className={cn("num mt-1 text-xl font-semibold leading-none", stat.accent)}>{currency(stat.value)}</p>
            <p className="mt-1 text-[10px] text-muted">{stat.hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Daily cash flow"
            description="Revenue compared with recorded expenses"
            action={
              <div className="flex items-center gap-2 text-[10.5px] text-muted">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-brand" /> Revenue
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-[#d8d5c8]" /> Expenses
                </span>
              </div>
            }
          />
          <div className="px-3 pb-3 pt-4">
            <BarChart
              data={dailyData}
              height={250}
              formatValue={(value) => currency(value)}
              secondaryLabel="Revenue"
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Cash by method" description="Where money was collected" />
          <div className="p-5">
            {methodData.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">No payments in this period.</p>
            ) : (
              <Donut
                data={methodData}
                centerValue={currency(stats?.cashCollected ?? 0)}
                centerLabel="cash collected"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
            <div className="rounded-lg bg-[#faf9f5] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted">Receivables</p>
              <p className="num mt-1 text-[14px] font-semibold">{currency(stats?.receivables ?? 0)}</p>
            </div>
            <div className="rounded-lg bg-[#faf9f5] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted">Payables</p>
              <p className="num mt-1 text-[14px] font-semibold">{currency(stats?.payables ?? 0)}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3.5">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "payments", label: "Payments", count: payments.data?.totalCount ?? 0 },
              { value: "refunds", label: "Refunds", count: refunds.data?.length ?? 0 },
              { value: "expenses", label: "Expenses", count: expenses.data?.length ?? 0 },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-8 w-[138px] text-[11px]"
              aria-label="From date"
            />
            <span className="text-[10px] text-muted">to</span>
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-8 w-[138px] text-[11px]"
              aria-label="To date"
            />
            {(from || to) && (
              <Button
                variant="ghost"
                size="sm"
                icon="close"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {tab === "payments" && (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-line p-3.5">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search order, customer or reference…"
                className="w-full sm:max-w-[320px]"
              />
              <Select value={method} onChange={(event) => setMethod(event.target.value)} className="w-[160px]">
                <option value="">Any method</option>
                {methods.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
            {payments.loading ? (
              <TableSkeleton rows={8} columns={7} />
            ) : payments.error ? (
              <ErrorState message={payments.error.message} onRetry={payments.reload} />
            ) : !payments.data || payments.data.items.length === 0 ? (
              <EmptyState icon="wallet" title="No payments found" description="Adjust the filters or record a payment." />
            ) : (
              <Table className="min-w-[860px]">
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Order</TH>
                    <TH>Counterparty</TH>
                    <TH>Direction</TH>
                    <TH>Method</TH>
                    <TH>Reference</TH>
                    <TH>Status</TH>
                    <TH align="right">Amount</TH>
                  </tr>
                </THead>
                <tbody>
                  {payments.data.items.map((payment) => (
                    <TR key={payment.id}>
                      <TD className="whitespace-nowrap text-[11px] text-muted">{dateTime(payment.paidAtUtc)}</TD>
                      <TD className="font-mono text-[11px] text-ink-soft">{payment.orderNumber ?? "—"}</TD>
                      <TD className="max-w-[160px] truncate text-[11.5px]">{payment.customerName ?? "Walk-in"}</TD>
                      <TD>
                        <Badge tone={payment.direction === "Incoming" ? "emerald" : "amber"}>
                          {payment.direction}
                        </Badge>
                      </TD>
                      <TD className="text-[11.5px] capitalize text-ink-soft">{payment.method}</TD>
                      <TD className="max-w-[130px] truncate font-mono text-[10.5px] text-muted">
                        {payment.reference ?? "—"}
                      </TD>
                      <TD>
                        <StatusBadge status={payment.status} />
                      </TD>
                      <TD
                        align="right"
                        className={cn(
                          "num text-[12.5px] font-medium",
                          payment.direction === "Incoming" ? "text-emerald-700" : "text-amber-700",
                        )}
                      >
                        {payment.direction === "Incoming" ? "+" : "−"}
                        {currency(payment.amount, payment.currencyCode)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
            {payments.data && !payments.loading && !payments.error && (
              <Pagination
                page={payments.data.page}
                totalPages={payments.data.totalPages}
                totalCount={payments.data.totalCount}
                pageSize={payments.data.pageSize}
                label="payments"
                onPage={setPage}
              />
            )}
          </>
        )}

        {tab === "refunds" && (
          refunds.loading ? (
            <TableSkeleton rows={6} columns={5} />
          ) : refunds.error ? (
            <ErrorState message={refunds.error.message} onRetry={refunds.reload} />
          ) : (refunds.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon="refresh"
              title="No refunds recorded"
              description="Refunds reduce net revenue and are linked to their order."
              action={
                <Button variant="primary" size="sm" icon="refresh" onClick={() => setRefundOpen(true)}>
                  Record refund
                </Button>
              }
            />
          ) : (
            <Table className="min-w-[620px]">
              <THead>
                <tr>
                  <TH>Order</TH>
                  <TH>Reason</TH>
                  <TH>Status</TH>
                  <TH>Processed</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <tbody>
                {(refunds.data ?? []).map((refund) => (
                  <TR key={refund.id}>
                    <TD className="font-mono text-[11.5px] font-medium">{refund.orderNumber}</TD>
                    <TD className="max-w-[280px] truncate text-[11.5px] text-ink-soft">{refund.reason}</TD>
                    <TD>
                      <StatusBadge status={refund.status} />
                    </TD>
                    <TD className="text-[11px] text-muted">{dateTime(refund.processedAtUtc)}</TD>
                    <TD align="right" className="num text-[12.5px] font-medium text-violet-700">
                      {currency(refund.amount)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        )}

        {tab === "expenses" && (
          <>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[11px] text-muted">Expenses are manual operating costs and reduce net revenue.</p>
              <Button variant="secondary" size="sm" icon="plus" onClick={() => setExpenseOpen(true)}>
                Add expense
              </Button>
            </div>
            {expenses.loading ? (
              <TableSkeleton rows={6} columns={5} />
            ) : expenses.error ? (
              <ErrorState message={expenses.error.message} onRetry={expenses.reload} />
            ) : (expenses.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon="receipt"
                title="No expenses recorded"
                description="Track software, rent, marketing and other operating costs here."
                action={
                  <Button variant="primary" size="sm" icon="plus" onClick={() => setExpenseOpen(true)}>
                    Add expense
                  </Button>
                }
              />
            ) : (
              <Table className="min-w-[680px]">
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Category</TH>
                    <TH>Description</TH>
                    <TH>Method</TH>
                    <TH align="right">Amount</TH>
                    <TH align="right"></TH>
                  </tr>
                </THead>
                <tbody>
                  {(expenses.data ?? []).map((expense) => (
                    <TR key={expense.id}>
                      <TD className="whitespace-nowrap text-[11px] text-muted">{date(expense.paidAtUtc)}</TD>
                      <TD>
                        <Badge tone="zinc">{expense.category}</Badge>
                      </TD>
                      <TD className="max-w-[280px] truncate text-[11.5px]">{expense.description}</TD>
                      <TD className="text-[11.5px] capitalize text-ink-soft">{expense.method}</TD>
                      <TD align="right" className="num text-[12.5px] font-medium">
                        {currency(expense.amount)}
                      </TD>
                      <TD align="right">
                        <button
                          type="button"
                          aria-label={`Delete ${expense.description}`}
                          onClick={() => setExpenseDelete(expense)}
                          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )}
      </Card>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record a payment"
        description="Payments can be linked to an order or recorded as a general receipt."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPayOpen(false)} disabled={payBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="wallet" loading={payBusy} onClick={() => void recordPayment()}>
              Record payment
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field
            label="Order"
            hint={selectedOrder ? `${selectedOrder.orderNumber} · total ${currency(selectedOrder.grandTotal, selectedOrder.currencyCode)}` : "Optional. Leave blank for a general payment."}
          >
            <Select
              value={payForm.orderId}
              onChange={(event) => {
                const order = orderOptions.find((item) => item.id === event.target.value);
                setPayForm({
                  ...payForm,
                  orderId: event.target.value,
                  amount: order ? String(order.grandTotal) : payForm.amount,
                });
              }}
            >
              <option value="">General payment</option>
              {orderOptions.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} · {order.customerName} · {currency(order.grandTotal, order.currencyCode)}
                </option>
              ))}
            </Select>
          </Field>
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
                {methods.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
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
                placeholder="Receipt or transaction reference"
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
          <Field label="Notes">
            <Textarea
              value={payForm.notes}
              onChange={(event) => setPayForm({ ...payForm, notes: event.target.value })}
              rows={2}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Record a refund"
        description="Refunds are recorded against an order and change its payment status."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRefundOpen(false)} disabled={refundBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="refresh" loading={refundBusy} onClick={() => void recordRefund()}>
              Record refund
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Order" required>
            <Select
              value={refundForm.orderId}
              onChange={(event) => setRefundForm({ ...refundForm, orderId: event.target.value })}
            >
              <option value="">Choose an order</option>
              {orderOptions.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} · {order.customerName} · {currency(order.grandTotal, order.currencyCode)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount" required>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={refundForm.amount}
              onChange={(event) => setRefundForm({ ...refundForm, amount: event.target.value })}
              required
            />
          </Field>
          <Field label="Reason" required>
            <Textarea
              value={refundForm.reason}
              onChange={(event) => setRefundForm({ ...refundForm, reason: event.target.value })}
              rows={3}
              placeholder="Why is this amount being refunded?"
              required
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        title="Add an expense"
        description="Expenses are workspace-level operating costs."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setExpenseOpen(false)} disabled={expenseBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="receipt" loading={expenseBusy} onClick={() => void addExpense()}>
              Add expense
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Select
                value={expenseForm.category}
                onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })}
              >
                {["Operations", "Software", "Marketing", "Rent", "Logistics", "Payroll", "Other"].map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" required>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={expenseForm.amount}
                onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })}
                required
              />
            </Field>
          </div>
          <Field label="Description" required>
            <Input
              value={expenseForm.description}
              onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })}
              placeholder="What was this cost for?"
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paid date" required>
              <Input
                type="date"
                value={expenseForm.paidAt}
                onChange={(event) => setExpenseForm({ ...expenseForm, paidAt: event.target.value })}
                required
              />
            </Field>
            <Field label="Method">
              <Select
                value={expenseForm.method}
                onChange={(event) => setExpenseForm({ ...expenseForm, method: event.target.value })}
              >
                {methods.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Reference">
            <Input
              value={expenseForm.reference}
              onChange={(event) => setExpenseForm({ ...expenseForm, reference: event.target.value })}
              placeholder="Invoice or receipt number"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(expenseDelete)}
        onClose={() => setExpenseDelete(null)}
        onConfirm={() => void deleteExpense()}
        title="Delete this expense?"
        description={expenseDelete ? `${expenseDelete.description} · ${currency(expenseDelete.amount)}` : undefined}
        confirmLabel="Delete expense"
        loading={deleteBusy}
      />

      <div className="flex items-center gap-2 text-[10.5px] text-muted">
        <Icon name="shield" size={11} />
        Finance totals are calculated server-side from payments, refunds and expenses. The UI never submits computed
        balances.
      </div>
    </div>
  );
}
