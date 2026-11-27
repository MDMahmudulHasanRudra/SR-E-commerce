"use client";

import { useState } from "react";
import { API_URL, api } from "@/lib/api";
import { errorMessage, useApi } from "@/lib/hooks";
import type { ApiKey, CreatedApiKey, DeliveryLog, IntegrationStatus, OutboxEvent } from "@/lib/types";
import { dateTime, number, relative } from "@/lib/format";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmModal,
  CopyButton,
  EmptyState,
  ErrorState,
  Field,
  InfoRow,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  StatusBadge,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableSkeleton,
  Tabs,
  cn,
  useToast,
} from "@/components/ui";

const scopes = [
  { value: "products.read", label: "Products", hint: "Search, detail, availability and pricing" },
  { value: "customers.read", label: "Customers", hint: "Search, detail and customer orders" },
  { value: "orders.read", label: "Orders", hint: "Order detail and status" },
  { value: "offers.read", label: "Offers", hint: "Active offers and discounts" },
];

export default function IntegrationPage() {
  const { push } = useToast();
  const [tab, setTab] = useState("keys");

  const status = useApi<IntegrationStatus>("/api/v1/integration/status");
  const keys = useApi<ApiKey[]>("/api/v1/integration/api-keys");
  const events = useApi<OutboxEvent[]>("/api/v1/integration/events?limit=100");
  const deliveries = useApi<DeliveryLog[]>("/api/v1/integration/deliveries?limit=100");

  const [keyOpen, setKeyOpen] = useState(false);
  const [keyForm, setKeyForm] = useState({ name: "", scopes: ["products.read", "customers.read", "orders.read", "offers.read"] });
  const [keyBusy, setKeyBusy] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [revokeKey, setRevokeKey] = useState<ApiKey | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const [eventView, setEventView] = useState<OutboxEvent | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const [connectionAction, setConnectionAction] = useState<"disable" | "revoke" | "reconnect" | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [connectionBusy, setConnectionBusy] = useState(false);

  const [ssoResult, setSsoResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [ssoBusy, setSsoBusy] = useState(false);

  async function createKey() {
    if (!keyForm.name.trim()) {
      push({ tone: "error", title: "Give the key a name" });
      return;
    }
    if (keyForm.scopes.length === 0) {
      push({ tone: "error", title: "Select at least one scope" });
      return;
    }
    setKeyBusy(true);
    try {
      const created = await api<CreatedApiKey>("/api/v1/integration/api-keys", {
        method: "POST",
        body: { name: keyForm.name.trim(), scopes: keyForm.scopes },
      });
      setCreatedKey(created);
      setKeyOpen(false);
      await Promise.all([keys.reload(), status.reload()]);
      push({ title: "API key created", description: "Copy the secret now — it is shown only once." });
    } catch (cause) {
      push({ tone: "error", title: "Could not create API key", description: errorMessage(cause) });
    } finally {
      setKeyBusy(false);
    }
  }

  async function revoke() {
    if (!revokeKey) return;
    setRevokeBusy(true);
    try {
      await api(`/api/v1/integration/api-keys/${revokeKey.id}`, { method: "DELETE" });
      await Promise.all([keys.reload(), status.reload()]);
      push({ title: "API key revoked", description: "Requests using this key will now be rejected." });
      setRevokeKey(null);
    } catch (cause) {
      push({ tone: "error", title: "Could not revoke key", description: errorMessage(cause) });
    } finally {
      setRevokeBusy(false);
    }
  }

  async function retry(event: OutboxEvent) {
    setRetrying(event.id);
    try {
      await api(`/api/v1/integration/events/${event.id}/retry`, { method: "POST" });
      await Promise.all([events.reload(), deliveries.reload(), status.reload()]);
      push({ title: "Event queued for retry" });
    } catch (cause) {
      push({ tone: "error", title: "Could not retry event", description: errorMessage(cause) });
    } finally {
      setRetrying(null);
    }
  }

  async function runConnectionAction() {
    if (!connectionAction) return;
    setConnectionBusy(true);
    try {
      const updated =
        connectionAction === "reconnect"
          ? await api<IntegrationStatus>("/api/v1/integration/reconnect", {
              method: "POST",
              body: { webhookUrl: webhookUrl.trim() || null },
            })
          : await api<IntegrationStatus>(`/api/v1/integration/${connectionAction}`, { method: "POST" });
      status.setData(updated);
      await Promise.all([keys.reload(), events.reload()]);
      push({
        title:
          connectionAction === "disable"
            ? "Connection disabled"
            : connectionAction === "revoke"
              ? "Connection revoked"
              : "Connection re-enabled",
        description:
          connectionAction === "disable"
            ? "The connection is inactive. API keys remain valid so it can be reconfigured."
            : connectionAction === "revoke"
              ? "API keys were permanently revoked. Provisioning is required to connect again."
              : "The connection record is active again. Events will resume delivery when a webhook is configured.",
      });
      setConnectionAction(null);
      setWebhookUrl("");
    } catch (cause) {
      push({ tone: "error", title: "Could not update connection", description: errorMessage(cause) });
    } finally {
      setConnectionBusy(false);
    }
  }

  async function checkSso() {
    setSsoBusy(true);
    try {
      await api("/api/v1/integrations/sso/exchange", { method: "POST", body: {} });
      setSsoResult({
        ok: true,
        message: "The endpoint responded, but this dashboard does not treat it as configured until an OIDC contract is agreed.",
      });
    } catch (cause) {
      setSsoResult({ ok: false, message: errorMessage(cause) });
    } finally {
      setSsoBusy(false);
    }
  }

  const data = status.data;
  const activeKeys = (keys.data ?? []).filter((key) => !key.isRevoked).length;
  const deadLettered = (events.data ?? []).filter((event) => event.status === "DeadLettered").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Integration"
        description="A versioned, read-only boundary for a host platform. Tokens are scoped and revocable; tenant identity is always derived server-side."
      >
        <CopyButton value={API_URL} label="Copy API base" />
        <Button variant="primary" icon="plug" onClick={() => setKeyOpen(true)}>
          Create API key
        </Button>
      </PageHeader>

      {status.loading ? (
        <Skeleton className="h-[190px] rounded-xl" />
      ) : status.error ? (
        <Card>
          <ErrorState message={status.error.message} onRetry={status.reload} />
        </Card>
      ) : data ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader
                title="Connection"
                description={data.hostPlatform === "None" ? "Standalone deployment — no host connection" : data.hostPlatform}
                action={<StatusBadge status={data.status} />}
              />
              <CardBody className="grid gap-x-8 sm:grid-cols-2">
                <div className="divide-y divide-[#efede5] py-0">
                  <InfoRow label="Workspace" value={data.workspaceName} />
                  <InfoRow
                    label="Connection ID"
                    value={data.connectionId ? <span className="font-mono text-[10px]">{data.connectionId.slice(0, 8)}…</span> : "Not provisioned"}
                  />
                  <InfoRow label="Host customer" value={data.hostCustomerId ?? "—"} />
                  <InfoRow label="Host project" value={data.hostProjectId ?? "—"} />
                </div>
                <div className="divide-y divide-[#efede5] py-0">
                  <InfoRow label="Contract" value={data.apiContractVersion} />
                  <InfoRow label="Last connected" value={data.lastConnectedAtUtc ? dateTime(data.lastConnectedAtUtc) : "Never"} />
                  <InfoRow
                    label="Last event"
                    value={data.lastEventDeliveredAtUtc ? relative(data.lastEventDeliveredAtUtc) : "No deliveries yet"}
                  />
                  <InfoRow
                    label="Webhook"
                    value={data.webhookUrl ? <span className="break-all font-mono text-[10px]">{data.webhookUrl}</span> : "Not configured"}
                  />
                </div>
              </CardBody>
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
                {data.status === "Disabled" || data.status === "NotConnected" ? (
                  <Button variant="secondary" size="sm" icon="plug" onClick={() => setConnectionAction("reconnect")}>
                    Enable connection
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" icon="close" onClick={() => setConnectionAction("disable")}>
                    Disable connection
                  </Button>
                )}
                <Button variant="danger" size="sm" icon="trash" onClick={() => setConnectionAction("revoke")}>
                  Revoke permanently
                </Button>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted">
                  <Icon name={data.provisioningConfigured ? "check" : "alert"} size={12} />
                  {data.provisioningConfigured ? "HMAC provisioning configured" : "Provisioning secret not configured"}
                </span>
              </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
              <Card className="px-4 py-3.5">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Active API keys</p>
                <p className="num mt-1 text-xl font-semibold leading-none">{number(activeKeys)}</p>
                <p className="mt-1 text-[10px] text-muted">{keys.data?.length ?? 0} total, including revoked</p>
              </Card>
              <Card className="px-4 py-3.5">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Pending events</p>
                <p className="num mt-1 text-xl font-semibold leading-none">{number(data.pendingEvents)}</p>
                <p className="mt-1 text-[10px] text-muted">Awaiting webhook delivery</p>
              </Card>
              <Card className="px-4 py-3.5">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Failed deliveries</p>
                <p className={cn("num mt-1 text-xl font-semibold leading-none", data.failedDeliveries > 0 ? "text-rose-600" : "text-ink")}>
                  {number(data.failedDeliveries)}
                </p>
                <p className="mt-1 text-[10px] text-muted">{deadLettered} dead-lettered</p>
              </Card>
              <Card className="px-4 py-3.5">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Provisioned</p>
                <p className="mt-1 text-[15px] font-semibold leading-tight">
                  {data.provisionedAtUtc ? dateTime(data.provisionedAtUtc) : "Not yet"}
                </p>
                <p className="mt-1 text-[10px] text-muted">Host-initiated setup</p>
              </Card>
            </div>
          </div>

          {!data.provisioningConfigured && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <p className="text-[12px] font-medium text-amber-900">Host provisioning is not configured on this deployment</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                  The HMAC provisioning secret is absent, so a Get Assist host cannot create a connection yet. Scoped API
                  keys can still be created manually below for testing the read APIs. This is not a working Get Assist
                  integration.
                </p>
              </div>
            </div>
          )}

          {data.lastError && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-rose-700" />
              <div>
                <p className="text-[12px] font-medium text-rose-900">Last connection error</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-rose-800">{data.lastError}</p>
              </div>
            </div>
          )}
        </>
      ) : null}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "keys", label: "API keys", count: keys.data?.length ?? 0 },
          { value: "events", label: "Outbox events", count: events.data?.length ?? 0 },
          { value: "deliveries", label: "Deliveries", count: deliveries.data?.length ?? 0 },
          { value: "readiness", label: "Readiness" },
        ]}
      />

      {tab === "keys" && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold">Scoped API keys</p>
              <p className="text-[11px] text-muted">
                Keys are hashed at rest. The raw value is shown once, at creation.
              </p>
            </div>
            <Button variant="secondary" size="sm" icon="plus" onClick={() => setKeyOpen(true)}>
              New key
            </Button>
          </div>
          {keys.loading ? (
            <TableSkeleton rows={5} columns={5} />
          ) : keys.error ? (
            <ErrorState message={keys.error.message} onRetry={keys.reload} />
          ) : (keys.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon="plug"
              title="No API keys"
              description="Create a scoped key to let a host platform read catalog, customer or order data."
              action={
                <Button variant="primary" size="sm" icon="plus" onClick={() => setKeyOpen(true)}>
                  Create API key
                </Button>
              }
            />
          ) : (
            <Table className="min-w-[780px]">
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Prefix</TH>
                  <TH>Scopes</TH>
                  <TH>Last used</TH>
                  <TH>Status</TH>
                  <TH align="right"></TH>
                </tr>
              </THead>
              <tbody>
                {(keys.data ?? []).map((key) => (
                  <TR key={key.id}>
                    <TD>
                      <p className="text-[12.5px] font-medium text-ink">{key.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted">Created {dateTime(key.createdAtUtc)}</p>
                    </TD>
                    <TD className="font-mono text-[11px] text-ink-soft">{key.keyPrefix}…</TD>
                    <TD>
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} tone="zinc">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD className="text-[11px] text-muted">
                      {key.lastUsedAtUtc ? relative(key.lastUsedAtUtc) : "Never"}
                    </TD>
                    <TD>
                      <Badge tone={key.isRevoked ? "rose" : "emerald"} dot>
                        {key.isRevoked ? "Revoked" : "Active"}
                      </Badge>
                    </TD>
                    <TD align="right">
                      {!key.isRevoked && (
                        <Button variant="ghost" size="sm" icon="trash" onClick={() => setRevokeKey(key)}>
                          Revoke
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "events" && (
        <Card>
          <CardHeader
            title="Outbox events"
            description="Domain events are written transactionally, then delivered to the host webhook."
            action={<Badge tone="zinc">{events.data?.length ?? 0} newest</Badge>}
          />
          {events.loading ? (
            <TableSkeleton rows={7} columns={6} />
          ) : events.error ? (
            <ErrorState message={events.error.message} onRetry={events.reload} />
          ) : (events.data?.length ?? 0) === 0 ? (
            <EmptyState icon="sparkle" title="No outbox events" description="Events appear when orders and refunds change state." />
          ) : (
            <Table className="min-w-[880px]">
              <THead>
                <tr>
                  <TH>Event</TH>
                  <TH>Subject</TH>
                  <TH>Status</TH>
                  <TH align="right">Attempts</TH>
                  <TH>Next attempt</TH>
                  <TH>Last error</TH>
                  <TH align="right"></TH>
                </tr>
              </THead>
              <tbody>
                {(events.data ?? []).map((event) => (
                  <TR key={event.id}>
                    <TD>
                      <p className="font-mono text-[10.5px] font-medium text-ink">{event.type}</p>
                      <p className="mt-0.5 text-[9.5px] text-muted">v{event.version} · {relative(event.occurredAtUtc)}</p>
                    </TD>
                    <TD className="max-w-[140px] truncate font-mono text-[10px] text-muted">{event.subjectId}</TD>
                    <TD>
                      <StatusBadge status={event.status} />
                    </TD>
                    <TD align="right" className="num text-[12px]">{event.attempts}</TD>
                    <TD className="whitespace-nowrap text-[10.5px] text-muted">
                      {event.status === "Delivered" ? "—" : dateTime(event.nextAttemptAtUtc)}
                    </TD>
                    <TD className="max-w-[200px] truncate text-[10.5px] text-rose-600">{event.lastError ?? "—"}</TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" icon="external" onClick={() => setEventView(event)}>
                          View
                        </Button>
                        {event.status !== "Delivered" && (
                          <Button variant="ghost" size="sm" icon="refresh" loading={retrying === event.id} onClick={() => void retry(event)}>
                            Retry
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "deliveries" && (
        <Card>
          <CardHeader
            title="Delivery attempts"
            description="Signed webhook attempts with status codes and duration."
            action={<Badge tone="zinc">{deliveries.data?.length ?? 0} newest</Badge>}
          />
          {deliveries.loading ? (
            <TableSkeleton rows={7} columns={6} />
          ) : deliveries.error ? (
            <ErrorState message={deliveries.error.message} onRetry={deliveries.reload} />
          ) : (deliveries.data?.length ?? 0) === 0 ? (
            <EmptyState icon="truck" title="No delivery attempts" description="Attempts appear once a webhook URL is configured." />
          ) : (
            <Table className="min-w-[760px]">
              <THead>
                <tr>
                  <TH>Event</TH>
                  <TH align="right">Attempt</TH>
                  <TH>Result</TH>
                  <TH align="right">Status code</TH>
                  <TH align="right">Duration</TH>
                  <TH>When</TH>
                </tr>
              </THead>
              <tbody>
                {(deliveries.data ?? []).map((delivery) => (
                  <TR key={delivery.id}>
                    <TD className="font-mono text-[10.5px] text-ink-soft">{delivery.eventType}</TD>
                    <TD align="right" className="num text-[12px]">{delivery.attempt}</TD>
                    <TD>
                      <Badge tone={delivery.success ? "emerald" : "rose"} dot>
                        {delivery.success ? "Delivered" : delivery.error ?? "Failed"}
                      </Badge>
                    </TD>
                    <TD align="right" className="num text-[11.5px] text-muted">{delivery.statusCode ?? "—"}</TD>
                    <TD align="right" className="num text-[11.5px] text-muted">{delivery.durationMs} ms</TD>
                    <TD className="whitespace-nowrap text-[10.5px] text-muted">{dateTime(delivery.createdAtUtc)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "readiness" && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Implemented in this repository"
                description="Read APIs and operational controls that exist and are exercised by tests."
                action={<Badge tone="emerald">Available</Badge>}
              />
              <CardBody>
                <ul className="space-y-2.5">
                  {[
                    ["Versioned read API", "GET /api/v1/integrations/* — products, offers, customers and orders."],
                    ["Scoped API keys", "Four read scopes, hashed keys, revocation and last-used tracking."],
                    ["HMAC provisioning", "POST /api/v1/integrations/provision, signed and replay-limited, when a secret is configured."],
                    ["Signed webhooks", "Transactional outbox with retries, dead-lettering and delivery logs."],
                    ["Connection lifecycle", "Disable, reconnect and permanently revoke a connection."],
                    ["Tenant isolation", "Workspace identity is always resolved from the API key or session, never from a client header."],
                  ].map(([title, body]) => (
                    <li key={title} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                        <Icon name="check" size={10} />
                      </span>
                      <span>
                        <span className="block text-[11.5px] font-medium text-ink">{title}</span>
                        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">{body}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Not implemented / pending agreement"
                description="These must not be presented as working integrations."
                action={<Badge tone="amber">Pending</Badge>}
              />
              <CardBody>
                <ul className="space-y-2.5">
                  {[
                    ["External SSO / OIDC", "The exchange endpoint returns HTTP 501. No launch-parameter login is accepted."],
                    ["Host write operations", "Only read scopes exist. Orders cannot be created or changed by the host API."],
                    ["Get Assist-specific contract", "No host-only endpoints are claimed until an agreement defines them."],
                    ["Provisioning on this deployment", status.data?.provisioningConfigured ? "Configured — the host still needs the shared secret." : "Not configured because the provisioning secret is absent."],
                    ["Production onboarding", "Requires an agreed OIDC contract, webhook URL and shared secrets."],
                  ].map(([title, body]) => (
                    <li key={title} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                        <Icon name="alert" size={10} />
                      </span>
                      <span>
                        <span className="block text-[11.5px] font-medium text-ink">{title}</span>
                        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">{body}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 rounded-lg border border-dashed border-line-strong bg-[#faf9f5] p-3">
                  <p className="text-[10.5px] leading-relaxed text-muted">
                    Integration details, example requests and the list of Get Assist agreements required before go-live
                    are in <span className="font-mono">docs/GET_ASSIST_INTEGRATION.md</span>.
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="SSO status check"
              description="Call the exchange endpoint and display the real response."
              action={<Badge tone="zinc">Expected: 501</Badge>}
            />
            <CardBody className="space-y-3">
              <p className="text-[11.5px] leading-relaxed text-muted">
                This button performs a live request. It does not sign anyone in and it does not fabricate success. Until
                an OpenID Connect contract is agreed and configured, the API correctly refuses the exchange.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" icon="shield" loading={ssoBusy} onClick={() => void checkSso()}>
                  Check SSO exchange
                </Button>
                {ssoResult && (
                  <Badge tone={ssoResult.ok ? "emerald" : "amber"} dot>
                    {ssoResult.ok ? "Responded" : "Not configured"}
                  </Badge>
                )}
              </div>
              {ssoResult && (
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed",
                    ssoResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900",
                  )}
                >
                  {ssoResult.message}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Read API surface" description="Paths available to a key with the matching scope" />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { scope: "products.read", paths: ["GET /products/search", "GET /products/{id}", "GET /products/{id}/availability", "GET /products/{id}/pricing"] },
                  { scope: "offers.read", paths: ["GET /offers/active"] },
                  { scope: "customers.read", paths: ["GET /customers/search", "GET /customers/{id}", "GET /customers/{id}/orders"] },
                  { scope: "orders.read", paths: ["GET /orders/{id}", "GET /orders/{id}/status"] },
                ].map((group) => (
                  <div key={group.scope} className="rounded-lg border border-line bg-[#faf9f5] p-3">
                    <Badge tone="brand">{group.scope}</Badge>
                    <ul className="mt-2 space-y-1">
                      {group.paths.map((path) => (
                        <li key={path} className="font-mono text-[10px] leading-relaxed text-ink-soft">
                          {path}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      <Modal
        open={keyOpen}
        onClose={() => setKeyOpen(false)}
        title="Create API key"
        description="The secret is returned once and never stored in plaintext."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setKeyOpen(false)} disabled={keyBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="plus" loading={keyBusy} onClick={() => void createKey()}>
              Create key
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Key name" required hint="Describe the system that will use this key.">
            <Input
              value={keyForm.name}
              onChange={(event) => setKeyForm({ ...keyForm, name: event.target.value })}
              placeholder="Get Assist production"
              required
            />
          </Field>
          <div>
            <p className="mb-2 text-xs font-medium text-ink-soft">Scopes</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {scopes.map((scope) => {
                const checked = keyForm.scopes.includes(scope.value);
                return (
                  <label
                    key={scope.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                      checked ? "border-brand bg-brand-soft/50" : "border-line bg-[#faf9f5] hover:border-line-strong",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setKeyForm({
                          ...keyForm,
                          scopes: checked
                            ? keyForm.scopes.filter((value) => value !== scope.value)
                            : [...keyForm.scopes, scope.value],
                        })
                      }
                      className="mt-0.5 h-3.5 w-3.5 accent-[#1d5d45]"
                    />
                    <span>
                      <span className="block text-[11.5px] font-medium text-ink">{scope.label}</span>
                      <span className="mt-0.5 block font-mono text-[9.5px] text-muted">{scope.value}</span>
                      <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">{scope.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(createdKey)}
        onClose={() => setCreatedKey(null)}
        title="API key created"
        description="Copy this secret now. It cannot be retrieved again."
        footer={
          <Button variant="primary" size="sm" onClick={() => setCreatedKey(null)}>
            Done
          </Button>
        }
      >
        {createdKey && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
              Store this value in a secret manager. Anyone with the key can read the scopes you selected.
            </div>
            <div className="rounded-lg border border-line bg-[#faf9f5] p-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">Secret</p>
              <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-ink">{createdKey.key}</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted">
                {createdKey.client.name} · {createdKey.client.scopes.join(", ")}
              </p>
              <CopyButton value={createdKey.key} label="Copy secret" />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(eventView)}
        onClose={() => setEventView(null)}
        title={eventView?.type ?? "Event"}
        description={eventView ? `Subject ${eventView.subjectId}` : undefined}
        size="lg"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setEventView(null)}>
            Close
          </Button>
        }
      >
        {eventView && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={eventView.status} />
              <Badge tone="zinc">v{eventView.version}</Badge>
              <span className="text-[10.5px] text-muted">
                {dateTime(eventView.occurredAtUtc)} · {eventView.attempts} attempt(s)
              </span>
            </div>
            <pre className="max-h-[320px] overflow-auto rounded-lg border border-line bg-[#faf9f5] p-3 font-mono text-[10.5px] leading-relaxed text-ink-soft">
              {prettyJson(eventView.payloadJson)}
            </pre>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(connectionAction)}
        onClose={() => setConnectionAction(null)}
        title={
          connectionAction === "revoke"
            ? "Revoke this connection permanently?"
            : connectionAction === "disable"
              ? "Disable this connection?"
              : "Enable this connection"
        }
        description={
          connectionAction === "revoke"
            ? "All API keys are revoked. Events stop. Reconnecting requires provisioning by the host."
            : connectionAction === "disable"
              ? "Delivery stops, but API keys remain valid so the connection can be reconfigured."
              : "Re-activate the connection record and optionally set a webhook URL."
        }
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConnectionAction(null)} disabled={connectionBusy}>
              Cancel
            </Button>
            <Button
              variant={connectionAction === "revoke" ? "danger" : "primary"}
              size="sm"
              loading={connectionBusy}
              onClick={() => void runConnectionAction()}
            >
              {connectionAction === "revoke" ? "Revoke permanently" : connectionAction === "disable" ? "Disable" : "Enable"}
            </Button>
          </>
        }
      >
        {connectionAction === "reconnect" && (
          <Field label="Webhook URL" hint="Optional. Must be an absolute https URL in production.">
            <Input
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://host.example.com/webhooks/commerce"
            />
          </Field>
        )}
        {connectionAction !== "reconnect" && (
          <p className="text-[11.5px] leading-relaxed text-muted">
            {connectionAction === "revoke"
              ? "This action cannot be undone from the dashboard. A new connection must be provisioned with a new API key."
              : "You can enable the connection again later without creating new keys."}
          </p>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(revokeKey)}
        onClose={() => setRevokeKey(null)}
        onConfirm={() => void revoke()}
        title={`Revoke ${revokeKey?.name ?? "this key"}?`}
        description="Requests using this key will immediately receive 401 responses. This cannot be undone."
        confirmLabel="Revoke key"
        loading={revokeBusy}
      />

      <div className="flex items-center gap-2 text-[10.5px] text-muted">
        <Icon name="shield" size={11} />
        No client-supplied tenant or workspace identifier is trusted on any integration endpoint.
      </div>
    </div>
  );
}

function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
