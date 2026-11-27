# Multi-Tenancy

Commerce uses a shared schema with explicit tenant and workspace ownership on
every business row. Isolation is enforced in three independent layers, so a bug
in one layer does not expose another tenant's data.

## Hierarchy

```text
CommerceTenant (company / legal entity)
  └── CommerceWorkspace (operating context, currency, time zone)
        ├── CommerceMembership (user + role)
        ├── Catalog, inventory, customers, orders, purchasing, pricing,
        │   finance, reports, audit
        └── AppConnection (optional Get Assist project link)

CommerceUser (email/password identity, belongs to one tenant)
```

- A user can be a member of several workspaces, but a token is issued for one
  active workspace at a time.
- `CommerceUser` is tenant-owned, so the same email is not shared across
  tenants. A second company registering the same email receives `409 CONFLICT`.
- Workspace membership is the authorization boundary. A user with no active
  membership in the selected workspace cannot use it, even with a valid token.

## Token claims

Access tokens are HS256 JWTs valid for 30 minutes by default. Relevant claims:

| Claim | Meaning |
| --- | --- |
| `sub` | user id |
| `email`, `name` | display identity |
| `role` | membership role in the selected workspace |
| `tid` | tenant id |
| `wid` | workspace id |
| `company`, `workspace`, `currency` | display values |
| `permission` | repeated permission strings for the role |

Claims are not trusted for tenant selection on their own. `MembershipMiddleware`
re-reads the membership, workspace, and user on every request.

## Enforcement layers

### 1. Membership middleware

For every authenticated JWT request, before authorization:

1. Parse `sub`, `tid`, `wid`; reject malformed tokens with `401`.
2. Load an **active** membership for exactly that user/tenant/workspace.
3. Load the workspace; require `Status == Active`.
4. Load the user; require `IsActive`.
5. Set `TenantContext` and the request role.
6. Continue to the role/scope policy.

API-key requests skip this middleware and are handled by the API-key
authentication handler, which resolves the key's own tenant/workspace and
checks the connection state.

### 2. EF Core global query filters

Every tenant-owned entity has a filter of the form:

```csharp
e.TenantId == CurrentTenantId
&& (CurrentWorkspaceId == Guid.Empty || e.WorkspaceId == CurrentWorkspaceId)
```

`CommerceTenant` itself is not filtered. `CommerceWorkspace`,
`CommerceUser` and `RefreshToken` are filtered by tenant only. `AppConnection`,
API keys, outbox events and delivery logs are filtered by tenant and workspace.

Consequences:

- A request with no tenant context (`TenantId == Guid.Empty`) sees no business
  rows. There is no "default tenant".
- `CurrentWorkspaceId == Guid.Empty` is only used by deliberate system paths;
  normal requests always carry a workspace.
- `FilterBypass` is `TenantContext.IsSystem`. It is set only by the outbox
  dispatcher and a few provisioning/auth lookups that must search across
  tenants before a context exists.

### 3. Save-time stamping

`CommerceDbContext.Stamp()` runs on every save:

- New tenant-owned rows with an empty `TenantId` receive the ambient tenant id;
  if no context exists and the context is not a system context, the write throws.
- New workspace-owned rows with an empty `WorkspaceId` receive the ambient
  workspace id, with the same guard.
- `UpdatedAtUtc`/`CreatedAtUtc` are set automatically.
- Outbox events and delivery logs are stamped explicitly.

Application services also assign tenant/workspace ids when creating entities,
so the database content is correct even for system-initiated writes.

## Intentional `IgnoreQueryFilters` paths

These are the only places that deliberately cross tenant boundaries. Each has a
specific reason and is reviewed as security-sensitive:

| Location | Reason |
| --- | --- |
| Login / refresh token lookup | Must find a user before a tenant context exists; validated against normalized email and hashed token. |
| Registration uniqueness and slug checks | Must detect collisions across all tenants. |
| Workspace switching | Must confirm the user has a membership in the requested workspace. |
| Provisioning | Must detect an existing host-project mapping and optionally link an existing workspace. |
| API-key authentication | Must resolve the key before tenant context exists. Then checks workspace active state and connection status. |
| Outbox dispatcher | Runs as a system context to deliver events for all workspaces. |
| Membership middleware | Resolves the membership and user for the presented token. |
| Demo seeding | Checks whether any tenant exists before seeding. |

Every other query runs under the global filters.

## Workspace switching

1. Client calls `POST /api/v1/auth/workspaces` (list) and then
   `POST /api/v1/auth/switch-workspace` with a workspace id.
2. The server verifies an active membership for the current user and that
   workspace.
3. A new access token and a rotated refresh token are issued for the new
   `tid`/`wid`.
4. The dashboard clears local state with a hard navigation to `/dashboard`.

## Integration tenant resolution

Host-platform requests never send a tenant id that is trusted. The server
resolves the workspace from the hashed API key:

1. Hash the presented `X-Api-Key` and find the client (cross-tenant lookup).
2. Reject revoked keys.
3. Require the owning workspace to be active.
4. When `GetAssist:RequireActiveConnection` is true (default), require an
   `Active` `AppConnection` for that workspace.
5. Set tenant/workspace context from the key, then apply the requested scope
   policy.

A host cannot ask for another workspace by changing a header or query string.
The only way to reach a different workspace is a different API key.

## Provisioning and workspace mapping

- `(HostPlatform, HostCustomerId, HostProjectId)` is unique in
  `AppConnections`. Repeating provisioning for the same project returns the
  existing mapping and does **not** create a duplicate workspace or key.
- A new project creates a tenant + primary workspace + default warehouse +
  standard tax rate + `Active` connection + one read-only API client.
- Alternatively, `CommerceWorkspaceId` can link an existing unlinked Commerce
  workspace. A workspace cannot be linked twice.
- The external workspace reference defaults to the Commerce workspace id and
  is returned in the provisioning response.

## Data isolation tests

`backend/tests/Commerce.Tests/ApiIntegrationTests.cs` covers, among others:

- Two tenants cannot read each other's products, orders or customers.
- A user without membership cannot open another workspace.
- Repeated provisioning is idempotent.
- Revoked keys and disabled connections stop host API access.
- Admin-only integration endpoints reject a normal member.
- A read-only key cannot call mutation endpoints.

## Operational rules

- Never add a request parameter that selects a tenant or workspace. Resolve it
  from the authenticated principal or API key.
- Never expose raw cross-tenant ids in responses intended for another tenant.
- Any new entity that holds business data must derive from `TenantEntity` (and
  `WorkspaceEntity` when workspace-scoped) and receive a global filter.
- Any new `IgnoreQueryFilters` call should be documented in the table above.
- Run the tenant-isolation tests when changing authentication, middleware,
  filters, provisioning or API-key handling.
