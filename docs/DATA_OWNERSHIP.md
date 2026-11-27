# Data Ownership

Commerce is the system of record for commerce operations in a workspace. Get
Assist is a host platform, not the owner of Commerce business data. This
document defines who owns what, how data is scoped, and what is still missing
for a formal data-processing agreement.

## Ownership model

| Data | Owner | System of record | Notes |
| --- | --- | --- | --- |
| Tenant/company profile | Commerce customer | Commerce | Name, slug, created date |
| Workspace settings | Commerce customer | Commerce | Name, currency, time zone, status |
| Users, memberships, roles | Commerce customer | Commerce | Password hashes never leave Commerce |
| Products, variants, media URLs | Commerce customer | Commerce | Get Assist may read via scoped API |
| Categories, brands | Commerce customer | Commerce | |
| Warehouses, stock, movements | Commerce customer | Commerce | Append-only movement history |
| Customers, addresses, tags, notes | Commerce customer | Commerce | PII; see below |
| Orders, items, invoices, returns | Commerce customer | Commerce | |
| Payments, refunds, expenses | Commerce customer | Commerce | No card data is stored |
| Offers, coupons, price history | Commerce customer | Commerce | |
| Suppliers, purchase orders, receipts | Commerce customer | Commerce | |
| Audit logs | Commerce customer | Commerce | Security-sensitive |
| Integration connection + API keys | Shared | Commerce holds the record | Get Assist holds its copy of the key/secret |
| Webhook delivery logs | Commerce customer | Commerce | Operational metadata |
| Host project/customer ids | Shared | Get Assist is authoritative for ids; Commerce stores the mapping | |

## Tenant and workspace scoping

- Every business row carries `TenantId`; workspace-owned rows also carry
  `WorkspaceId`.
- Reads, writes and uniqueness constraints are workspace-scoped. For example
  SKUs, order numbers, invoice numbers, coupon codes and warehouse codes are
  unique within a workspace, not globally.
- `AppConnection` is unique per `(HostPlatform, HostCustomerId, HostProjectId)`
  and links to exactly one workspace.
- API keys are bound to one workspace. A host cannot request another workspace.

## External identifiers

- Customers can store one `ExternalSource` + `ExternalId` pair (for example a
  future Get Assist customer id). No uniqueness constraint is enforced across
  customers; use the duplicate search before linking.
- Orders store `Source` and `ExternalOrderId` for imported/attributed orders.
- The connection stores `ExternalWorkspaceReference` for the host's project
  reference.
- These fields are attribution/mapping aids. They never grant access or select a
  tenant.

## Money, tax and currency

- Money is `decimal(18,2)`. Tax rates are percentages (`10` = 10%).
- Effective prices and order totals are computed server-side.
- One currency per workspace, stored on the workspace and copied onto orders,
  payments, products and invoices at creation time.
- No FX conversion is performed. A workspace that changes its currency code does
  not convert historical amounts; consumers must treat stored currency codes as
  authoritative per record.
- Commerce does not store card numbers, CVVs or bank credentials. `method` and
  `reference` are free-text operational fields.

## Personal data

Commerce stores customer PII and staff account data:

- Customer: name, email, phone, company, addresses, notes, tags, order history.
- Staff: name, email, password hash, role, active flag, last login.
- Integration: host customer/project ids, webhook URL, API-key prefix and hash.

Handling rules:

- Passwords use PBKDF2-SHA256 with per-password salts. Refresh tokens are stored
  hashed. API keys are stored as SHA-256 hashes with a visible prefix.
- Logs redact secrets; correlation ids and entity ids are logged, not tokens.
- API responses expose only the selected workspace's data.
- The integration read API returns customer PII to a scoped key. Issue keys only
  to trusted host services and rotate/revoke them promptly.
- Do not put PII in tags or free-text fields unless the workspace has agreed to
  it.

### Retention and deletion

Implemented today:

- Products and customers use soft delete (`IsDeleted`) and disappear from normal
  queries.
- Orders retain a denormalised customer name/email/phone so historical invoices
  remain meaningful if a customer is deleted.
- Audit logs are retained for security and cannot be deleted through the API.
- No automatic retention job, hard-delete endpoint or subject-access export
  exists.

Before a regulated production launch, agree:

1. Retention periods for orders, audit logs and delivery logs.
2. A hard-delete/anonymisation procedure for customer PII, including order
   history handling.
3. A subject-access/export procedure.
4. Backup retention and secure destruction.
5. Which party is processor vs. controller for host-sourced customer data.

## Backups and recovery

- PostgreSQL is the only persistent store. Back it up with `pg_dump` or
  provider snapshots.
- The API container is stateless; the Next.js container is stateless except for
  the Next cache, which can be rebuilt.
- Restore procedure and commands are in `DEPLOYMENT.md`.
- Backups contain PII and must be encrypted, access-controlled and tested.

## Integration data exchange

- **Commerce → Get Assist:** read-only product, offer, customer and order data;
  signed webhook events.
- **Get Assist → Commerce:** provisioning payload, API-key-authenticated reads,
  and (future) OIDC identity claims. No business writes exist yet.
- Get Assist must not cache Commerce data longer than agreed or use it for a
  different customer/project.
- Commerce does not send customer PII in events except identifiers and order
  totals. Webhook payloads avoid names, emails, phone numbers and addresses.
  If the host needs customer detail, it should call the scoped customer API.
- The host must verify webhooks and deduplicate events.

## Audit trail

Audited actions include settings/company changes, team changes, product
create/update/delete, stock adjustments/transfers, order create/status changes,
payments/refunds, and integration provision/disable/reconnect/revoke. Records
contain action, entity type/id, optional user, optional details and timestamp,
scoped to the workspace. Audit rows are visible to Admins only.

## Open agreements

The following are not yet formalised and must be agreed with Get Assist before
production:

- Data-processing agreement and roles (controller/processor).
- Sub-processor list and hosting regions.
- Cross-border transfer mechanism.
- Breach notification timelines and contacts.
- Data subject request handling between the parties.
- Retention/deletion schedule for the mapping records and API keys.
- Whether Get Assist may store Commerce customer PII and for how long.
- Ownership of analytics derived from Commerce events.
- Exit/portability format and timeline.
