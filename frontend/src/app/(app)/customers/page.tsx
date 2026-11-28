"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, query, type Paged } from "@/lib/api";
import { errorMessage, useApi, useDebounced } from "@/lib/hooks";
import type { CustomerDetail, CustomerListItem, CustomerReport } from "@/lib/types";
import { currency, number, relative } from "@/lib/format";
import { CustomerForm, customerPayload, emptyCustomerForm, type CustomerFormValue } from "@/components/CustomerForm";
import { Icon } from "@/components/icons";
import {
  Avatar,
  Badge,
  Button,
  Card,
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
  useToast,
} from "@/components/ui";

export default function CustomersPage() {
  const router = useRouter();
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CustomerFormValue>(emptyCustomerForm);
  const [saving, setSaving] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupEmail, setDupEmail] = useState("");
  const [dupPhone, setDupPhone] = useState("");
  const [dupBusy, setDupBusy] = useState(false);
  const [dupResults, setDupResults] = useState<CustomerListItem[] | null>(null);
  const debouncedSearch = useDebounced(search);
  const debouncedTag = useDebounced(tagFilter);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") setCreateOpen(true);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, debouncedTag, type]);

  const customers = useApi<Paged<CustomerListItem>>(
    `/api/v1/customers${query({
      search: debouncedSearch,
      tag: debouncedTag,
      isBusiness: type === "business" ? true : type === "individual" ? false : undefined,
      page,
      pageSize: 12,
    })}`,
  );
  const report = useApi<CustomerReport>("/api/v1/reports/customers");

  async function checkDuplicates() {
    if (!dupEmail.trim() && !dupPhone.trim()) {
      push({ tone: "error", title: "Enter an email or phone number to check" });
      return;
    }
    setDupBusy(true);
    try {
      const rows = await api<CustomerListItem[]>(
        `/api/v1/customers/duplicates${query({
          email: dupEmail.trim() || undefined,
          phone: dupPhone.trim() || undefined,
        })}`,
      );
      setDupResults(rows);
    } catch (cause) {
      push({ tone: "error", title: "Duplicate check failed", description: errorMessage(cause) });
    } finally {
      setDupBusy(false);
    }
  }

  async function create() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      push({ tone: "error", title: "First and last name are required" });
      return;
    }
    setSaving(true);
    try {
      const created = await api<CustomerDetail>("/api/v1/customers", {
        method: "POST",
        body: customerPayload(form),
      });
      push({ title: "Customer created", description: `${created.displayName} was added to this workspace.` });
      setCreateOpen(false);
      setForm(emptyCustomerForm);
      router.push(`/customers/${created.id}`);
    } catch (cause) {
      push({ tone: "error", title: "Could not create customer", description: errorMessage(cause) });
    } finally {
      setSaving(false);
    }
  }

  const stats = [
    { label: "Customers", value: report.data?.totalCustomers ?? 0, hint: "In this workspace", accent: "text-ink" },
    { label: "New", value: report.data?.newCustomers ?? 0, hint: "In the selected period", accent: "text-sky-700" },
    { label: "Repeat", value: report.data?.repeatCustomers ?? 0, hint: "Two or more orders", accent: "text-emerald-700" },
    {
      label: "Average lifetime value",
      value: currency(report.data?.averageLifetimeValue ?? 0),
      hint: "Across all customers",
      accent: "text-ink",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Customers"
        description="A single record per customer, with addresses, tags, order history and optional host-platform links."
      >
        <Button
          variant="secondary"
          icon="search"
          onClick={() => {
            setDupResults(null);
            setDupOpen(true);
          }}
        >
          Find duplicates
        </Button>
        <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
          New customer
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="px-4 py-3.5">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{stat.label}</p>
            <p className={`num mt-1 text-xl font-semibold leading-none ${stat.accent}`}>{stat.value}</p>
            <p className="mt-1 text-[10px] text-muted">{stat.hint}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3.5 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, email or phone…"
            className="w-full lg:max-w-[320px]"
          />
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <Input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="Filter by tag…"
              className="w-[150px]"
            />
            <Select value={type} onChange={(event) => setType(event.target.value)} className="w-[170px]">
              <option value="">All account types</option>
              <option value="individual">Individuals</option>
              <option value="business">Businesses</option>
            </Select>
            {(type || tagFilter) && (
              <Button
                variant="ghost"
                size="sm"
                icon="close"
                onClick={() => {
                  setType("");
                  setTagFilter("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {customers.loading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : customers.error ? (
          <ErrorState message={customers.error.message} onRetry={customers.reload} />
        ) : !customers.data || customers.data.items.length === 0 ? (
          <EmptyState
            icon="users"
            title="No customers found"
            description="Try a different search, or add the first customer to this workspace."
            action={
              <Button variant="primary" size="sm" icon="plus" onClick={() => setCreateOpen(true)}>
                New customer
              </Button>
            }
          />
        ) : (
          <Table className="min-w-[840px]">
            <THead>
              <tr>
                <TH>Customer</TH>
                <TH>Contact</TH>
                <TH>Tags</TH>
                <TH align="right">Orders</TH>
                <TH align="right">Total spent</TH>
                <TH>Last order</TH>
                <TH>Source</TH>
                <TH align="right"></TH>
              </tr>
            </THead>
            <tbody>
              {customers.data.items.map((customer) => (
                <TR key={customer.id} onClick={() => router.push(`/customers/${customer.id}`)}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={customer.displayName} size={30} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                          <span className="max-w-[180px] truncate">{customer.displayName}</span>
                          {customer.isBusiness && <Badge tone="blue">Business</Badge>}
                        </p>
                        <p className="max-w-[200px] truncate text-[10.5px] text-muted">
                          {customer.companyName ?? "Individual account"}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <p className="max-w-[200px] truncate text-[11.5px] text-ink-soft">{customer.email ?? "—"}</p>
                    <p className="text-[10.5px] text-muted">{customer.phone ?? "No phone"}</p>
                  </TD>
                  <TD>
                    <div className="flex max-w-[180px] flex-wrap gap-1">
                      {(customer.tags ?? "")
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((tag) => (
                          <Badge key={tag} tone="zinc">
                            {tag}
                          </Badge>
                        ))}
                      {!customer.tags && <span className="text-[11px] text-muted">—</span>}
                    </div>
                  </TD>
                  <TD align="right" className="num text-[12px]">
                    {number(customer.orderCount)}
                  </TD>
                  <TD align="right" className="num text-[12.5px] font-medium">
                    {currency(customer.totalSpent)}
                  </TD>
                  <TD className="whitespace-nowrap text-[11px] text-muted">
                    {customer.lastOrderAtUtc ? relative(customer.lastOrderAtUtc) : "Never"}
                  </TD>
                  <TD>
                    {customer.externalSource ? (
                      <Badge tone="brand">{customer.externalSource}</Badge>
                    ) : (
                      <span className="text-[11px] text-muted">Standalone</span>
                    )}
                  </TD>
                  <TD align="right">
                    <Icon name="chevronRight" size={15} className="ml-auto text-[#b6b9ae]" />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}

        {customers.data && !customers.loading && !customers.error && (
          <Pagination
            page={customers.data.page}
            totalPages={customers.data.totalPages}
            totalCount={customers.data.totalCount}
            pageSize={customers.data.pageSize}
            label="customers"
            onPage={setPage}
          />
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New customer"
        description="Customers are scoped to the active workspace."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="plus" loading={saving} onClick={() => void create()}>
              Create customer
            </Button>
          </>
        }
      >
        <CustomerForm value={form} onChange={setForm} />
      </Modal>

      <Modal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        title="Find duplicate customers"
        description="Search by email or phone before creating or linking an external Get Assist contact."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDupOpen(false)}>
              Close
            </Button>
            <Button variant="primary" size="sm" icon="search" loading={dupBusy} onClick={() => void checkDuplicates()}>
              Check duplicates
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input
                type="email"
                value={dupEmail}
                onChange={(event) => setDupEmail(event.target.value)}
                placeholder="customer@example.com"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={dupPhone}
                onChange={(event) => setDupPhone(event.target.value)}
                placeholder="+1 555 0100"
              />
            </Field>
          </div>
          {dupResults && (
            <div className="rounded-xl border border-line bg-[#faf9f5] p-3">
              {dupResults.length === 0 ? (
                <p className="text-xs text-muted">No matching customers found in this workspace.</p>
              ) : (
                <div className="divide-y divide-line">
                  {dupResults.map((match) => (
                    <div key={match.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <div>
                        <p className="font-medium text-ink">{match.displayName}</p>
                        <p className="text-[11px] text-muted">
                          {match.email ?? "No email"} · {match.phone ?? "No phone"}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setDupOpen(false);
                          router.push(`/customers/${match.id}`);
                        }}
                      >
                        Open profile
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <div className="flex items-center gap-2 text-[10.5px] text-muted">
        <Icon name="shield" size={11} />
        Duplicate emails and phone numbers are detected by the API before a new record is created.
      </div>
    </div>
  );
}
