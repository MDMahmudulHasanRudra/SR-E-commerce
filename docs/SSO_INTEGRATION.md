# SSO Integration

> **Update (14 Nov 2026):** signing in from Get Assist is implemented without
> OIDC, as a signed host launch with link-once identity mapping. See
> `GET_ASSIST_INTEGRATION.md` §4. Everything below is about **OIDC**, which is
> still not implemented and is no longer needed for Get Assist.

**OIDC status: not implemented.**

Commerce does not accept Get Assist identities today. There is no OpenID Connect
client, no token exchange, no external identity table and no launch-token
validation. The only SSO-related surface is:

| Endpoint | Behaviour |
| --- | --- |
| `POST /api/v1/integrations/sso/exchange` | Always `501 SSO_NOT_CONFIGURED` |
| `GET /api/v1/auth/sso/status` | `enabled: false`, `mode: "oidc"`, `configured` = `HostPlatform:OidcEnabled` |

The placeholder configuration is:

```json
"HostPlatform": {
  "OidcEnabled": false,
  "OidcAuthority": "",
  "OidcClientId": "",
  "OidcAudience": ""
}
```

These keys are not consumed by any authentication path. Do not enable
`OidcEnabled` expecting SSO to start working; it only changes the status value.

## Why it is not implemented

A secure SSO integration requires agreements and infrastructure that do not
exist yet:

- a Get Assist OIDC provider with a registered Commerce client;
- agreed redirect URIs for every environment;
- a claim contract for user, customer and project identity;
- a decision on who may create Commerce memberships;
- certificate/secret distribution and rotation;
- end-to-end tests with a real Get Assist tenant.

Implementing a partial exchange without these would create an authentication
bypass. The spec explicitly requires that SSO is not claimed until both sides
are implemented and tested.

## Proposed flow (to be agreed)

```text
User            Get Assist             Commerce API                 Commerce DB
 │  open app        │                       │                           │
 │─────────────────►│                       │                           │
 │                  │ authorize + consent   │                           │
 │                  │ (OIDC, PKCE)          │                           │
 │                  │──────────────────────►│                           │
 │                  │  code + state         │                           │
 │                  │                       │ validate code/state/PKCE  │
 │                  │                       │ verify issuer/audience    │
 │                  │                       │ read sub/email/project    │
 │                  │                       │ resolve AppConnection     │
 │                  │                       │ resolve active membership │
 │                  │                       │──────────────────────────►│
 │                  │                       │ issue Commerce JWT        │
 │◄─────────────────┼───────────────────────│ rotate refresh token      │
 │  Commerce session│                       │                           │
```

### Steps

1. Get Assist redirects the browser to Commerce's login/launch route with a
   short-lived authorization code or a signed launch context.
2. Commerce validates `state`, PKCE verifier and redirect URI.
3. Commerce exchanges the code with the Get Assist token endpoint using a
   confidential client (client secret or private key JWT).
4. Commerce validates the ID token: signature, issuer, audience, expiry, nonce,
   and optionally `azp`.
5. Commerce extracts the agreed claims and resolves the host project:
   `hostPlatform + hostCustomerId + hostProjectId → AppConnection`.
6. Commerce maps the external subject to an **existing active local member** of
   that workspace.
7. Commerce issues its normal access/refresh token pair. The dashboard behaves
   exactly as after password login.
8. All subsequent authorization uses Commerce membership, not host claims.

## Required identity contract

The following claims must be agreed before implementation:

| Claim | Required | Use |
| --- | --- | --- |
| `iss` | yes | Exact issuer match |
| `aud` | yes | Commerce client id |
| `sub` | yes | Stable external user id |
| `email` | yes | Display and audit; never sole authorization |
| `email_verified` | recommended | Refuse unverified identities if required |
| `name` | recommended | Display name |
| `host_customer_id` | yes | Maps to `AppConnection.HostCustomerId` |
| `host_project_id` | yes | Maps to `AppConnection.HostProjectId` |
| `roles` / `groups` | optional | Suggestion only; must not auto-grant Commerce roles |
| `nonce` | yes | Replay protection |
| `auth_time` | recommended | Freshness policy |

The host project ids must be stable. Do not use display names or mutable slugs
as keys.

## Identity mapping rules

1. Resolve the connection first. An unknown project is rejected; it cannot
   create a tenant.
2. Find the user by verified email **within the connection's tenant**, or by a
   future `ExternalIdentity` table keyed by `(issuer, subject)`.
3. Require an active `CommerceMembership` for the connection's workspace.
4. Never auto-create a membership from SSO. A workspace Admin must invite the
   user first, or an explicit, audited "auto-provision members" policy must be
   agreed in writing.
5. Never accept a workspace id from the browser. It comes from the connection
   resolved server-side.
6. On every SSO request, re-check membership `IsActive`, user `IsActive` and
   workspace `Status`. Disabling a member takes effect immediately.

Recommended future schema (not present):

```text
ExternalIdentity
  Id, TenantId, UserId, Issuer, Subject, Email,
  CreatedAtUtc, LastLoginAtUtc, (unique Issuer + Subject)
```

## Security requirements

- Authorization Code flow with PKCE; no implicit flow.
- Confidential client. Client secret or private key JWT only server-side.
- Exact redirect URI allowlist per environment.
- Validate issuer, audience, signature, `exp`, `iat`, `nbf`, `nonce` and clock
  skew (≤60 seconds).
- Fetch JWKS over HTTPS with caching and key-rotation handling.
- Reject unsigned tokens (`alg: none`) and unexpected algorithms.
- Bind the launch to the browser session with `state` and a protected cookie.
- Rate-limit the exchange and log failures without logging tokens or codes.
- Do not put access tokens in URLs, `localStorage` history or referrer headers.
- Clear the host session on logout only through an agreed logout contract; do
  not trust a client-supplied logout redirect.
- If embedding in an iframe, set `frame-ancestors` to the exact Get Assist
  origins and use `SameSite=None; Secure` cookies for the launch handshake.
- Keep the existing Commerce JWT and refresh-token rotation; do not replace
  them with host tokens.

## Suggested endpoints (for agreement)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/auth/sso/start` | Generate state/nonce/PKCE, redirect to the host authority |
| `GET /api/v1/auth/sso/callback` | Validate the code, resolve identity, issue Commerce session |
| `POST /api/v1/auth/sso/exchange` | Replace the current 501 stub with the server-to-server code exchange, if the host prefers a backend-driven flow |
| `POST /api/v1/auth/sso/logout` | Optional back-channel logout or session revocation |

The existing `POST /api/v1/integrations/sso/exchange` path is reserved. Its
current 501 response is intentional and tested.

## Failure behaviour

| Condition | Result |
| --- | --- |
| Missing/expired launch context | `401`, no session |
| Invalid signature/issuer/audience | `401`, audit failure |
| Unknown host project | `403`, no tenant creation |
| No matching Commerce member | `403`, explicit message |
| Inactive member/workspace | `403` |
| Replayed nonce/state | `401` |
| Host authority unavailable | `503`, password login still works |
| SSO not configured | `501`, password login still works |

SSO must never block standalone email/password login. Existing sessions remain
valid during an SSO outage.

## Configuration once agreed

```json
"HostPlatform": {
  "Name": "Get Assist",
  "OidcEnabled": true,
  "OidcAuthority": "https://auth.getassist.example",
  "OidcClientId": "commerce-prod",
  "OidcAudience": "commerce-api",
  "WorkspaceLaunchUrl": "https://app.getassist.example/launch/commerce",
  "AllowedParentOrigins": "https://app.getassist.example"
}
```

The client secret must come from a secret manager/environment variable, never
from source control. Add:

```text
HostPlatform__OidcClientSecret=…
```

The option class does not yet contain a client secret field; adding it is part
of the implementation work.

## Test plan before claiming SSO works

1. Happy path with a real host test tenant.
2. Wrong audience, issuer, signature and expired token are rejected.
3. Replayed state/nonce is rejected.
4. Unknown project cannot create a tenant or membership.
5. Known project + unknown user is rejected.
6. Inactive/revoked membership is rejected even when the host token is valid.
7. Disabling a member blocks the next SSO login.
8. Password login still works with SSO disabled or the authority down.
9. Cross-tenant project mapping cannot reach another workspace.
10. Audit records capture success/failure without tokens or secrets.
11. Iframe launch works only from the allowlisted parent origin.
12. Logout revokes the Commerce refresh token.

## Explicit non-claims

- No SSO code path exists.
- No Get Assist OIDC client is registered.
- No external identity table exists.
- `OidcEnabled: true` does not enable SSO.
- No launch token, `postMessage` handshake or automatic session is implemented.
