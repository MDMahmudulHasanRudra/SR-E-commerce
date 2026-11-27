"use client";

import { useEffect, useState } from "react";
import { api, query, type Paged } from "@/lib/api";
import { errorMessage, useApi, useDebounced } from "@/lib/hooks";
import type { AuditLog, CompanySettings, TaxRate, TeamMember } from "@/lib/types";
import { date, dateTime, number, percent, relative } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
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
  TD,
  TH,
  THead,
  TR,
  Table,
  TableSkeleton,
  Tabs,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";

const roles = ["Viewer", "Staff", "Manager", "Admin", "Owner"];

export default function SettingsPage() {
  const { session, refresh } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState("company");

  const company = useApi<CompanySettings>("/api/v1/settings/company");
  const team = useApi<TeamMember[]>("/api/v1/settings/team");
  const taxRates = useApi<TaxRate[]>("/api/v1/settings/tax-rates");

  const [auditSearch, setAuditSearch] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const debouncedAudit = useDebounced(auditSearch);
  const audit = useApi<Paged<AuditLog>>(
    `/api/v1/settings/audit${query({ search: debouncedAudit, page: auditPage, pageSize: 20 })}`,
  );

  const [companyForm, setCompanyForm] = useState({
    companyName: "",
    workspaceName: "",
    currencyCode: "USD",
    timeZone: "UTC",
  });
  const [companyBusy, setCompanyBusy] = useState(false);

  const [memberOpen, setMemberOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "Staff",
  });
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberEdit, setMemberEdit] = useState<TeamMember | null>(null);
  const [memberEditForm, setMemberEditForm] = useState({ role: "Staff", isActive: true });

  const [taxOpen, setTaxOpen] = useState(false);
  const [taxEditing, setTaxEditing] = useState<string | null>(null);
  const [taxForm, setTaxForm] = useState({ name: "", rate: "0", isDefault: false, isInclusive: false });
  const [taxBusy, setTaxBusy] = useState(false);
  const [taxDelete, setTaxDelete] = useState<TaxRate | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (company.data) {
      setCompanyForm({
        companyName: company.data.companyName,
        workspaceName: company.data.workspaceName,
        currencyCode: company.data.currencyCode,
        timeZone: company.data.timeZone,
      });
    }
  }, [company.data]);

  useEffect(() => {
    setAuditPage(1);
  }, [debouncedAudit]);

  async function saveCompany() {
    if (!companyForm.companyName.trim() || !companyForm.workspaceName.trim()) {
      push({ tone: "error", title: "Company and workspace names are required" });
      return;
    }
    setCompanyBusy(true);
    try {
      const updated = await api<CompanySettings>("/api/v1/settings/company", {
        method: "PUT",
        body: companyForm,
      });
      company.setData(updated);
      refresh();
      push({ title: "Workspace settings saved", description: "The change is recorded in the audit log." });
    } catch (cause) {
      push({ tone: "error", title: "Could not save settings", description: errorMessage(cause) });
    } finally {
      setCompanyBusy(false);
    }
  }

  async function createMember() {
    if (!memberForm.fullName.trim() || !memberForm.email.trim() || memberForm.password.length < 8) {
      push({ tone: "error", title: "Name, email and a password of at least 8 characters are required" });
      return;
    }
    setMemberBusy(true);
    try {
      await api("/api/v1/settings/team", { method: "POST", body: memberForm });
      await team.reload();
      push({ title: "Team member added", description: `${memberForm.fullName} can sign in with the email provided.` });
      setMemberOpen(false);
      setMemberForm({ fullName: "", email: "", password: "", role: "Staff" });
    } catch (cause) {
      push({ tone: "error", title: "Could not add team member", description: errorMessage(cause) });
    } finally {
      setMemberBusy(false);
    }
  }

  async function updateMember() {
    if (!memberEdit) return;
    setMemberBusy(true);
    try {
      await api(`/api/v1/settings/team/${memberEdit.userId}`, {
        method: "PUT",
        body: { role: memberEditForm.role, isActive: memberEditForm.isActive },
      });
      await team.reload();
      push({ title: "Team member updated" });
      setMemberEdit(null);
    } catch (cause) {
      push({ tone: "error", title: "Could not update team member", description: errorMessage(cause) });
    } finally {
      setMemberBusy(false);
    }
  }

  function openTax(rate?: TaxRate) {
    if (rate) {
      setTaxEditing(rate.id);
      setTaxForm({
        name: rate.name,
        rate: String(rate.rate),
        isDefault: rate.isDefault,
        isInclusive: rate.isInclusive,
      });
    } else {
      setTaxEditing(null);
      setTaxForm({ name: "", rate: "0", isDefault: false, isInclusive: false });
    }
    setTaxOpen(true);
  }

  async function saveTax() {
    const rate = Number(taxForm.rate);
    if (!taxForm.name.trim()) {
      push({ tone: "error", title: "Tax name is required" });
      return;
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      push({ tone: "error", title: "Rate must be between 0 and 100" });
      return;
    }
    setTaxBusy(true);
    try {
      await api(taxEditing ? `/api/v1/settings/tax-rates/${taxEditing}` : "/api/v1/settings/tax-rates", {
        method: taxEditing ? "PUT" : "POST",
        body: { name: taxForm.name.trim(), rate, isDefault: taxForm.isDefault, isInclusive: taxForm.isInclusive },
      });
      await taxRates.reload();
      push({ title: taxEditing ? "Tax rate updated" : "Tax rate created" });
      setTaxOpen(false);
    } catch (cause) {
      push({ tone: "error", title: "Could not save tax rate", description: errorMessage(cause) });
    } finally {
      setTaxBusy(false);
    }
  }

  async function deleteTax() {
    if (!taxDelete) return;
    setDeleteBusy(true);
    try {
      await api(`/api/v1/settings/tax-rates/${taxDelete.id}`, { method: "DELETE" });
      await taxRates.reload();
      push({ title: "Tax rate deleted" });
      setTaxDelete(null);
    } catch (cause) {
      push({ tone: "error", title: "Could not delete tax rate", description: errorMessage(cause) });
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Company identity, team access, tax rates and the audit trail for this workspace."
      >
        <Badge tone={company.data?.status === "Active" ? "emerald" : "amber"} dot>
          {company.data?.status ?? "Loading"}
        </Badge>
        <Badge tone="zinc">Contract {company.data?.apiContractVersion ?? "v1"}</Badge>
      </PageHeader>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "company", label: "Company" },
          { value: "team", label: "Team", count: team.data?.length ?? 0 },
          { value: "tax", label: "Tax rates", count: taxRates.data?.length ?? 0 },
          { value: "audit", label: "Audit log", count: audit.data?.totalCount ?? 0 },
        ]}
      />

      {tab === "company" && (
        company.loading ? (
          <Skeleton className="h-[420px] rounded-xl" />
        ) : company.error ? (
          <Card>
            <ErrorState message={company.error.message} onRetry={company.reload} />
          </Card>
        ) : company.data ? (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader
                title="Workspace identity"
                description="Names and currency are scoped to this workspace. Currency changes apply to new records."
              />
              <CardBody className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Company name" required>
                    <Input
                      value={companyForm.companyName}
                      onChange={(event) => setCompanyForm({ ...companyForm, companyName: event.target.value })}
                    />
                  </Field>
                  <Field label="Workspace name" required>
                    <Input
                      value={companyForm.workspaceName}
                      onChange={(event) => setCompanyForm({ ...companyForm, workspaceName: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Currency code" hint="Three-letter ISO code, for example USD.">
                    <Input
                      value={companyForm.currencyCode}
                      maxLength={3}
                      className="font-mono uppercase"
                      onChange={(event) =>
                        setCompanyForm({ ...companyForm, currencyCode: event.target.value.toUpperCase() })
                      }
                    />
                  </Field>
                  <Field label="Time zone" hint="IANA or UTC. Used for reporting boundaries.">
                    <Select
                      value={companyForm.timeZone}
                      onChange={(event) => setCompanyForm({ ...companyForm, timeZone: event.target.value })}
                    >
                      {["UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Asia/Dhaka", "Asia/Singapore"].map(
                        (zone) => (
                          <option key={zone} value={zone}>
                            {zone}
                          </option>
                        ),
                      )}
                    </Select>
                  </Field>
                </div>
                <div className="flex justify-end pt-1">
                  <Button variant="primary" icon="check" loading={companyBusy} onClick={() => void saveCompany()}>
                    Save changes
                  </Button>
                </div>
              </CardBody>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader title="Workspace record" action={<Icon name="shield" size={15} className="text-brand" />} />
                <CardBody className="divide-y divide-[#efede5] py-0">
                  <InfoRow label="Company" value={company.data.companyName} />
                  <InfoRow label="Workspace" value={company.data.workspaceName} />
                  <InfoRow
                    label="Tenant slug"
                    value={<span className="font-mono text-[11px]">{company.data.tenantSlug}</span>}
                  />
                  <InfoRow
                    label="Workspace ID"
                    value={<span className="font-mono text-[10px]">{company.data.workspaceId.slice(0, 8)}…</span>}
                  />
                  <InfoRow label="Currency" value={company.data.currencyCode} />
                  <InfoRow label="Created" value={date(company.data.createdAtUtc)} />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Signed-in account" />
                <CardBody className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={session?.user.fullName} size={34} />
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium">{session?.user.fullName}</p>
                      <p className="truncate text-[11px] text-muted">{session?.user.email}</p>
                    </div>
                    <Badge tone="brand" className="ml-auto">
                      {session?.user.role}
                    </Badge>
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-muted">
                    Role changes and membership are checked by the API on every request. The UI does not grant access on
                    its own.
                  </p>
                </CardBody>
              </Card>
            </div>
          </div>
        ) : null
      )}

      {tab === "team" && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold">Workspace team</p>
              <p className="text-[11px] text-muted">Members can only be added by an administrator.</p>
            </div>
            <Button variant="primary" size="sm" icon="plus" onClick={() => setMemberOpen(true)}>
              Add member
            </Button>
          </div>
          {team.loading ? (
            <TableSkeleton rows={6} columns={5} />
          ) : team.error ? (
            <ErrorState message={team.error.message} onRetry={team.reload} />
          ) : (team.data?.length ?? 0) === 0 ? (
            <EmptyState icon="users" title="No team members" description="Invite a colleague to this workspace." />
          ) : (
            <Table className="min-w-[700px]">
              <THead>
                <tr>
                  <TH>Member</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Last sign-in</TH>
                  <TH>Added</TH>
                  <TH align="right"></TH>
                </tr>
              </THead>
              <tbody>
                {(team.data ?? []).map((member) => (
                  <TR key={member.userId}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={member.fullName} size={28} />
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-medium">{member.fullName}</p>
                          <p className="truncate text-[10.5px] text-muted">{member.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={member.role === "Owner" || member.role === "Admin" ? "brand" : "zinc"}>
                        {member.role}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={member.isActive ? "emerald" : "zinc"} dot>
                        {member.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </TD>
                    <TD className="text-[11px] text-muted">
                      {member.lastLoginAtUtc ? relative(member.lastLoginAtUtc) : "Never"}
                    </TD>
                    <TD className="text-[11px] text-muted">{date(member.createdAtUtc)}</TD>
                    <TD align="right">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="edit"
                        onClick={() => {
                          setMemberEdit(member);
                          setMemberEditForm({ role: member.role, isActive: member.isActive });
                        }}
                      >
                        Manage
                      </Button>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "tax" && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold">Tax rates</p>
              <p className="text-[11px] text-muted">Rates are percentages used when calculating line-item tax.</p>
            </div>
            <Button variant="primary" size="sm" icon="plus" onClick={() => openTax()}>
              Add tax rate
            </Button>
          </div>
          {taxRates.loading ? (
            <TableSkeleton rows={5} columns={5} />
          ) : taxRates.error ? (
            <ErrorState message={taxRates.error.message} onRetry={taxRates.reload} />
          ) : (taxRates.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon="receipt"
              title="No tax rates"
              description="Add the rates that apply to the products you sell."
              action={
                <Button variant="primary" size="sm" icon="plus" onClick={() => openTax()}>
                  Add tax rate
                </Button>
              }
            />
          ) : (
            <Table className="min-w-[620px]">
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH align="right">Rate</TH>
                  <TH>Default</TH>
                  <TH>Pricing</TH>
                  <TH align="right"></TH>
                </tr>
              </THead>
              <tbody>
                {(taxRates.data ?? []).map((rate) => (
                  <TR key={rate.id}>
                    <TD className="text-[12.5px] font-medium">{rate.name}</TD>
                    <TD align="right" className="num text-[12.5px]">{percent(rate.rate, 2)}</TD>
                    <TD>{rate.isDefault ? <Badge tone="brand">Default</Badge> : <span className="text-[11px] text-muted">—</span>}</TD>
                    <TD className="text-[11.5px] text-ink-soft">{rate.isInclusive ? "Tax inclusive" : "Added to price"}</TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" icon="edit" onClick={() => openTax(rate)}>
                          Edit
                        </Button>
                        <button
                          type="button"
                          aria-label={`Delete ${rate.name}`}
                          onClick={() => setTaxDelete(rate)}
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
      )}

      {tab === "audit" && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3.5">
            <SearchInput
              value={auditSearch}
              onChange={setAuditSearch}
              placeholder="Search action, entity or user…"
              className="w-full sm:max-w-[340px]"
            />
            <span className="ml-auto text-[10.5px] text-muted">
              {number(audit.data?.totalCount ?? 0)} recorded events
            </span>
          </div>
          {audit.loading ? (
            <TableSkeleton rows={8} columns={5} />
          ) : audit.error ? (
            <ErrorState message={audit.error.message} onRetry={audit.reload} />
          ) : !audit.data || audit.data.items.length === 0 ? (
            <EmptyState icon="shield" title="No audit events" description="Workspace changes will appear here as they happen." />
          ) : (
            <Table className="min-w-[760px]">
              <THead>
                <tr>
                  <TH>Action</TH>
                  <TH>Entity</TH>
                  <TH>Details</TH>
                  <TH>User</TH>
                  <TH>When</TH>
                </tr>
              </THead>
              <tbody>
                {audit.data.items.map((event) => (
                  <TR key={event.id}>
                    <TD>
                      <span className="rounded-md border border-line bg-[#faf9f5] px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                        {event.action}
                      </span>
                    </TD>
                    <TD>
                      <p className="text-[11.5px] font-medium">{event.entityType}</p>
                      <p className="font-mono text-[9.5px] text-muted">{event.entityId.slice(0, 8)}…</p>
                    </TD>
                    <TD className="max-w-[260px] truncate text-[11px] text-muted">{event.details ?? "—"}</TD>
                    <TD className="text-[11.5px] text-ink-soft">{event.userName ?? "System"}</TD>
                    <TD className="whitespace-nowrap text-[10.5px] text-muted">
                      <span title={dateTime(event.createdAtUtc)}>{relative(event.createdAtUtc)}</span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
          {audit.data && !audit.loading && !audit.error && (
            <Pagination
              page={audit.data.page}
              totalPages={audit.data.totalPages}
              totalCount={audit.data.totalCount}
              pageSize={audit.data.pageSize}
              label="events"
              onPage={setAuditPage}
            />
          )}
        </Card>
      )}

      <Modal
        open={memberOpen}
        onClose={() => setMemberOpen(false)}
        title="Add team member"
        description="The member is added to this workspace with the role you choose."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setMemberOpen(false)} disabled={memberBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="plus" loading={memberBusy} onClick={() => void createMember()}>
              Add member
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Full name" required>
            <Input
              value={memberForm.fullName}
              onChange={(event) => setMemberForm({ ...memberForm, fullName: event.target.value })}
              placeholder="Alex Morgan"
              required
            />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              value={memberForm.email}
              onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })}
              placeholder="alex@company.com"
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Temporary password" required hint="At least 8 characters.">
              <Input
                type="password"
                value={memberForm.password}
                onChange={(event) => setMemberForm({ ...memberForm, password: event.target.value })}
                required
              />
            </Field>
            <Field label="Role">
              <Select
                value={memberForm.role}
                onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value })}
              >
                {roles.filter((role) => role !== "Owner").map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(memberEdit)}
        onClose={() => setMemberEdit(null)}
        title={memberEdit ? `Manage ${memberEdit.fullName}` : "Manage member"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setMemberEdit(null)} disabled={memberBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={memberBusy} onClick={() => void updateMember()}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Role">
            <Select
              value={memberEditForm.role}
              onChange={(event) => setMemberEditForm({ ...memberEditForm, role: event.target.value })}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Access">
            <Select
              value={memberEditForm.isActive ? "active" : "disabled"}
              onChange={(event) => setMemberEditForm({ ...memberEditForm, isActive: event.target.value === "active" })}
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </Field>
          <p className="text-[10.5px] leading-relaxed text-muted">
            Disabled members cannot sign in to this workspace. Their historical actions remain in the audit log.
          </p>
        </div>
      </Modal>

      <Modal
        open={taxOpen}
        onClose={() => setTaxOpen(false)}
        title={taxEditing ? "Edit tax rate" : "Add tax rate"}
        description="Rates are stored as percentage values, for example 10 means 10%."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setTaxOpen(false)} disabled={taxBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={taxBusy} onClick={() => void saveTax()}>
              {taxEditing ? "Save changes" : "Add rate"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" required>
            <Input
              value={taxForm.name}
              onChange={(event) => setTaxForm({ ...taxForm, name: event.target.value })}
              placeholder="Standard VAT"
              required
            />
          </Field>
          <Field label="Rate (%)" required>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={taxForm.rate}
              onChange={(event) => setTaxForm({ ...taxForm, rate: event.target.value })}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Default">
              <Select
                value={taxForm.isDefault ? "yes" : "no"}
                onChange={(event) => setTaxForm({ ...taxForm, isDefault: event.target.value === "yes" })}
              >
                <option value="no">No</option>
                <option value="yes">Yes — apply by default</option>
              </Select>
            </Field>
            <Field label="Pricing">
              <Select
                value={taxForm.isInclusive ? "inclusive" : "exclusive"}
                onChange={(event) => setTaxForm({ ...taxForm, isInclusive: event.target.value === "inclusive" })}
              >
                <option value="exclusive">Added to price</option>
                <option value="inclusive">Included in price</option>
              </Select>
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(taxDelete)}
        onClose={() => setTaxDelete(null)}
        onConfirm={() => void deleteTax()}
        title={`Delete ${taxDelete?.name ?? "this tax rate"}?`}
        description="Tax rates referenced by products should be replaced before deleting."
        confirmLabel="Delete rate"
        loading={deleteBusy}
      />

      <div className="flex items-center gap-2 text-[10.5px] text-muted">
        <Icon name="shield" size={11} />
        Settings endpoints require membership in this workspace; administrative writes require the Admin role.
      </div>
    </div>
  );
}
