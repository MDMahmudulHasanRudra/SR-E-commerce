"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { errorMessage, useApi } from "@/lib/hooks";
import type { CustomerDetail } from "@/lib/types";
import { currency, date, dateTime, number, relative } from "@/lib/format";
import { customerToForm, CustomerForm, customerPayload, type CustomerFormValue } from "@/components/CustomerForm";
import { NewOrderModal } from "@/components/NewOrderModal";
import { Icon } from "@/components/icons";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmModal,
  ErrorState,
  Field,
  InfoRow,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tabs,
  useToast,
} from "@/components/ui";

type AddressForm = {
  type: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

const emptyAddress: AddressForm = {
  type: "Shipping",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  isDefault: false,
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();
  const { data, loading, error, reload, setData } = useApi<CustomerDetail>(`/api/v1/customers/${params.id}`);
  const [tab, setTab] = useState("overview");

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<CustomerFormValue | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const [addressOpen, setAddressOpen] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressForm>(emptyAddress);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ source: "get-assist", externalId: "" });
  const [linkBusy, setLinkBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-[380px] rounded-xl" />
          <Skeleton className="h-[380px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-ink"
        >
          <Icon name="chevronLeft" size={13} /> Back to customers
        </Link>
        <Card>
          <ErrorState message={error?.message ?? "Customer not found."} onRetry={reload} />
        </Card>
      </div>
    );
  }

  function openEdit() {
    if (!data) return;
    setForm(customerToForm(data));
    setEditOpen(true);
  }

  async function saveCustomer() {
    if (!form || !data) return;
    if (!form.firstName.trim() || !form.lastName.trim()) {
      push({ tone: "error", title: "First and last name are required" });
      return;
    }
    setEditBusy(true);
    try {
      const updated = await api<CustomerDetail>(`/api/v1/customers/${data.id}`, {
        method: "PUT",
        body: customerPayload(form),
      });
      setData(updated);
      push({ title: "Customer updated" });
      setEditOpen(false);
    } catch (cause) {
      push({ tone: "error", title: "Could not update customer", description: errorMessage(cause) });
    } finally {
      setEditBusy(false);
    }
  }

  async function addAddress() {
    if (!data) return;
    if (!addressForm.line1.trim() || !addressForm.city.trim() || !addressForm.country.trim()) {
      push({ tone: "error", title: "Address line 1, city and country are required" });
      return;
    }
    setAddressBusy(true);
    try {
      await api(`/api/v1/customers/${data.id}/addresses`, {
        method: "POST",
        body: addressForm,
      });
      await reload();
      push({ title: "Address added" });
      setAddressOpen(false);
      setAddressForm(emptyAddress);
    } catch (cause) {
      push({ tone: "error", title: "Could not add address", description: errorMessage(cause) });
    } finally {
      setAddressBusy(false);
    }
  }

  async function deleteAddress() {
    if (!data || !addressToDelete) return;
    setAddressBusy(true);
    try {
      await api(`/api/v1/customers/${data.id}/addresses/${addressToDelete}`, { method: "DELETE" });
      await reload();
      push({ title: "Address removed" });
      setAddressToDelete(null);
    } catch (cause) {
      push({ tone: "error", title: "Could not remove address", description: errorMessage(cause) });
    } finally {
      setAddressBusy(false);
    }
  }

  async function linkExternal() {
    if (!data) return;
    if (!linkForm.source.trim() || !linkForm.externalId.trim()) {
      push({ tone: "error", title: "Source and external ID are required" });
      return;
    }
    setLinkBusy(true);
    try {
      const updated = await api<CustomerDetail>(`/api/v1/customers/${data.id}/link-external`, {
        method: "POST",
        body: { source: linkForm.source.trim(), externalId: linkForm.externalId.trim() },
      });
      setData(updated);
      push({ title: "External link saved", description: "Integration responses now include this mapping." });
      setLinkOpen(false);
    } catch (cause) {
      push({ tone: "error", title: "Could not link customer", description: errorMessage(cause) });
    } finally {
      setLinkBusy(false);
    }
  }

  async function unlinkExternal() {
    if (!data) return;
    setLinkBusy(true);
    try {
      const updated = await api<CustomerDetail>(`/api/v1/customers/${data.id}/link-external`, { method: "DELETE" });
      setData(updated);
      push({ title: "External link removed" });
    } catch (cause) {
      push({ tone: "error", title: "Could not unlink customer", description: errorMessage(cause) });
    } finally {
      setLinkBusy(false);
    }
  }

  async function deleteCustomer() {
    if (!data) return;
    setDeleteBusy(true);
    try {
      await api(`/api/v1/customers/${data.id}`, { method: "DELETE" });
      push({ title: "Customer deleted" });
      router.push("/customers");
    } catch (cause) {
      push({ tone: "error", title: "Could not delete customer", description: errorMessage(cause) });
      setDeleteBusy(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/customers"
          className="mb-3 inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-ink"
        >
          <Icon name="chevronLeft" size={13} /> Back to customers
        </Link>
        <PageHeader
          eyebrow="Customer"
          title={
            <span className="flex items-center gap-2.5">
              <Avatar name={data.displayName} size={34} />
              {data.displayName}
            </span>
          }
          description={`${data.isBusiness ? data.companyName ?? "Business account" : "Individual account"} · Customer since ${date(data.createdAtUtc)}`}
        >
          {data.isBusiness && <Badge tone="blue">Business</Badge>}
          {data.externalSource && <Badge tone="brand">{data.externalSource}</Badge>}
          <Button variant="primary" icon="plus" onClick={() => setNewOrderOpen(true)}>
            New order
          </Button>
          <Button variant="secondary" icon="edit" onClick={openEdit}>
            Edit
          </Button>
          {data.email ? (
            <a href={`mailto:${data.email}`}>
              <Button variant="secondary" icon="mail">
                Email
              </Button>
            </a>
          ) : (
            <Button variant="secondary" icon="mail" disabled>
              Email
            </Button>
          )}
          <Button variant="danger" icon="trash" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </PageHeader>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Orders</p>
          <p className="num mt-1 text-xl font-semibold leading-none">{number(data.orderCount)}</p>
          <p className="mt-1 text-[10px] text-muted">Lifetime orders</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Total spent</p>
          <p className="num mt-1 text-xl font-semibold leading-none text-emerald-700">{currency(data.totalSpent)}</p>
          <p className="mt-1 text-[10px] text-muted">Across all orders</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Average order</p>
          <p className="num mt-1 text-xl font-semibold leading-none">
            {currency(data.orderCount > 0 ? data.totalSpent / data.orderCount : 0)}
          </p>
          <p className="mt-1 text-[10px] text-muted">Per order</p>
        </Card>
        <Card className="px-4 py-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Last order</p>
          <p className="mt-1 text-[15px] font-semibold leading-tight">
            {data.lastOrderAtUtc ? relative(data.lastOrderAtUtc) : "Never"}
          </p>
          <p className="mt-1 text-[10px] text-muted">
            {data.lastOrderAtUtc ? dateTime(data.lastOrderAtUtc) : "No orders placed yet"}
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card>
            <div className="border-b border-line px-5 py-3.5">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "overview", label: "Overview" },
                  { value: "orders", label: "Orders", count: data.recentOrders.length },
                  { value: "addresses", label: "Addresses", count: data.addresses.length },
                ]}
              />
            </div>

            {tab === "overview" && (
              <CardBody className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-0.5">
                    <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">Contact</p>
                    <InfoRow label="Email" value={data.email ?? "—"} />
                    <InfoRow label="Phone" value={data.phone ?? "—"} />
                    <InfoRow label="Company" value={data.companyName ?? "—"} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">Account</p>
                    <InfoRow label="Type" value={data.isBusiness ? "Business" : "Individual"} />
                    <InfoRow
                      label="Tags"
                      value={
                        data.tags ? (
                          <span className="flex flex-wrap justify-end gap-1">
                            {data.tags.split(",").map((tag) => (
                              <Badge key={tag} tone="zinc">
                                {tag.trim()}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          "—"
                        )
                      }
                    />
                    <InfoRow label="Created" value={date(data.createdAtUtc)} />
                  </div>
                </div>
                <div className="border-t border-line pt-4">
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">Notes</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
                    {data.notes || "No notes recorded for this customer."}
                  </p>
                </div>
              </CardBody>
            )}

            {tab === "orders" && (
              data.recentOrders.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-xs text-muted">This customer has not placed an order yet.</p>
                  <Link href="/orders?new=1" className="mt-3 inline-block">
                    <Button variant="secondary" size="sm" icon="plus">
                      Create an order
                    </Button>
                  </Link>
                </div>
              ) : (
                <Table className="min-w-[520px]">
                  <THead>
                    <tr>
                      <TH>Order</TH>
                      <TH>Status</TH>
                      <TH>Placed</TH>
                      <TH align="right">Total</TH>
                      <TH align="right"></TH>
                    </tr>
                  </THead>
                  <tbody>
                    {data.recentOrders.map((order) => (
                      <TR key={order.id} onClick={() => router.push(`/orders/${order.id}`)}>
                        <TD className="font-mono text-[11.5px] font-medium">{order.orderNumber}</TD>
                        <TD>
                          <StatusBadge status={order.status} />
                        </TD>
                        <TD className="text-[11px] text-muted">{dateTime(order.placedAtUtc)}</TD>
                        <TD align="right" className="num text-[12.5px] font-medium">
                          {currency(order.grandTotal, order.currencyCode)}
                        </TD>
                        <TD align="right">
                          <Icon name="chevronRight" size={15} className="ml-auto text-[#b6b9ae]" />
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )
            )}

            {tab === "addresses" && (
              <div>
                <div className="flex items-center justify-between border-b border-line px-5 py-3">
                  <p className="text-[11px] text-muted">{data.addresses.length} saved address(es)</p>
                  <Button variant="secondary" size="sm" icon="plus" onClick={() => setAddressOpen(true)}>
                    Add address
                  </Button>
                </div>
                {data.addresses.length === 0 ? (
                  <div className="px-5 py-12 text-center text-xs text-muted">No addresses saved for this customer.</div>
                ) : (
                  <div className="grid gap-3 p-4 sm:grid-cols-2">
                    {data.addresses.map((address) => (
                      <div key={address.id} className="rounded-xl border border-line bg-[#faf9f5] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <Badge tone={address.type.toLowerCase() === "billing" ? "violet" : "blue"}>
                            {address.type}
                          </Badge>
                          <div className="flex items-center gap-1">
                            {address.isDefault && <Badge tone="brand">Default</Badge>}
                            <button
                              type="button"
                              aria-label="Remove address"
                              onClick={() => setAddressToDelete(address.id)}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          </div>
                        </div>
                        <address className="mt-2.5 not-italic text-[11.5px] leading-relaxed text-ink-soft">
                          <span className="block">{address.line1}</span>
                          {address.line2 && <span className="block">{address.line2}</span>}
                          <span className="block">
                            {[address.city, address.state, address.postalCode].filter(Boolean).join(", ")}
                          </span>
                          <span className="block">{address.country}</span>
                        </address>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="External link"
              description="Map this customer to a host-platform record."
              action={<Badge tone={data.externalSource ? "emerald" : "zinc"}>{data.externalSource ? "Linked" : "Unlinked"}</Badge>}
            />
            <CardBody className="space-y-3">
              {data.externalSource ? (
                <>
                  <InfoRow label="Source" value={data.externalSource} />
                  <InfoRow label="External ID" value={<span className="font-mono text-[11px]">{data.externalId ?? "—"}</span>} />
                  <Button variant="secondary" size="sm" icon="close" loading={linkBusy} onClick={() => void unlinkExternal()}>
                    Remove link
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    Linking is optional. It lets the integration API resolve this customer from the host platform&apos;s
                    identifier without duplicating records.
                  </p>
                  <Button variant="secondary" size="sm" icon="plug" onClick={() => setLinkOpen(true)}>
                    Link external record
                  </Button>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Addresses" action={<Badge tone="zinc">{data.addresses.length}</Badge>} />
            <div className="divide-y divide-[#efede5]">
              {data.addresses.length === 0 && <p className="px-5 py-6 text-[11.5px] text-muted">No addresses on file.</p>}
              {data.addresses.slice(0, 3).map((address) => (
                <div key={address.id} className="px-5 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                    {address.type}
                    {address.isDefault ? " · default" : ""}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
                    {address.line1}, {[address.city, address.state].filter(Boolean).join(", ")} {address.postalCode}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-line px-4 py-2.5">
              <Button variant="ghost" size="sm" icon="plus" onClick={() => setAddressOpen(true)}>
                Add address
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Workspace safety" />
            <CardBody className="space-y-2 text-[11px] leading-relaxed text-muted">
              <p className="flex items-start gap-2">
                <Icon name="shield" size={13} className="mt-0.5 shrink-0 text-brand" />
                This customer is only visible to members of the active workspace. Tenant IDs are resolved server-side.
              </p>
              <p className="flex items-start gap-2">
                <Icon name="clock" size={13} className="mt-0.5 shrink-0 text-brand" />
                Deleting a customer keeps historical orders intact for accounting and reporting.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit customer"
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(false)} disabled={editBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={editBusy} onClick={() => void saveCustomer()}>
              Save changes
            </Button>
          </>
        }
      >
        {form && <CustomerForm value={form} onChange={setForm} excludeCustomerId={data.id} />}
      </Modal>

      <Modal
        open={addressOpen}
        onClose={() => setAddressOpen(false)}
        title="Add address"
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAddressOpen(false)} disabled={addressBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={addressBusy} onClick={() => void addAddress()}>
              Add address
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Select
                value={addressForm.type}
                onChange={(event) => setAddressForm({ ...addressForm, type: event.target.value })}
              >
                <option value="Shipping">Shipping</option>
                <option value="Billing">Billing</option>
              </Select>
            </Field>
            <Field label="Country" required>
              <Input
                value={addressForm.country}
                onChange={(event) => setAddressForm({ ...addressForm, country: event.target.value })}
                placeholder="United States"
                required
              />
            </Field>
          </div>
          <Field label="Address line 1" required>
            <Input
              value={addressForm.line1}
              onChange={(event) => setAddressForm({ ...addressForm, line1: event.target.value })}
              placeholder="123 Market Street"
              required
            />
          </Field>
          <Field label="Address line 2">
            <Input
              value={addressForm.line2}
              onChange={(event) => setAddressForm({ ...addressForm, line2: event.target.value })}
              placeholder="Suite 400"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="City" required>
              <Input
                value={addressForm.city}
                onChange={(event) => setAddressForm({ ...addressForm, city: event.target.value })}
                placeholder="San Francisco"
                required
              />
            </Field>
            <Field label="State / region">
              <Input
                value={addressForm.state}
                onChange={(event) => setAddressForm({ ...addressForm, state: event.target.value })}
                placeholder="CA"
              />
            </Field>
            <Field label="Postal code">
              <Input
                value={addressForm.postalCode}
                onChange={(event) => setAddressForm({ ...addressForm, postalCode: event.target.value })}
                placeholder="94103"
              />
            </Field>
          </div>
          <Field label="Default address">
            <Select
              value={addressForm.isDefault ? "yes" : "no"}
              onChange={(event) => setAddressForm({ ...addressForm, isDefault: event.target.value === "yes" })}
            >
              <option value="no">No</option>
              <option value="yes">Yes — use for new orders</option>
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Link external record"
        description="The mapping is stored per workspace and is reversible."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setLinkOpen(false)} disabled={linkBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="plug" loading={linkBusy} onClick={() => void linkExternal()}>
              Save link
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Source" required hint="For example: get-assist.">
            <Input
              value={linkForm.source}
              onChange={(event) => setLinkForm({ ...linkForm, source: event.target.value })}
              placeholder="get-assist"
              required
            />
          </Field>
          <Field label="External ID" required>
            <Input
              value={linkForm.externalId}
              onChange={(event) => setLinkForm({ ...linkForm, externalId: event.target.value })}
              placeholder="Host platform customer identifier"
              required
            />
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(addressToDelete)}
        onClose={() => setAddressToDelete(null)}
        onConfirm={() => void deleteAddress()}
        title="Remove this address?"
        description="The address is deleted from this customer. Existing orders keep their own shipping snapshot."
        confirmLabel="Remove address"
        loading={addressBusy}
      />

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void deleteCustomer()}
        title="Delete this customer?"
        description="The customer record is removed. Historical orders remain for accounting and reporting."
        confirmLabel="Delete customer"
        loading={deleteBusy}
      />

      <NewOrderModal
        open={newOrderOpen}
        onClose={() => setNewOrderOpen(false)}
        initialCustomerId={data.id}
        onCreated={(order) => {
          setNewOrderOpen(false);
          router.push(`/orders/${order.id}`);
        }}
      />

      <div className="flex items-center gap-2 text-[10.5px] text-muted">
        <Icon name="shield" size={11} />
        Linked external identifiers are never trusted as authentication; they only map records inside this workspace.
      </div>
    </div>
  );
}
