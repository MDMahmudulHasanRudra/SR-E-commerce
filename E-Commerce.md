# MASTER DEVELOPMENT INSTRUCTIONS
## Build a Professional, Standalone & Integration-Ready E-commerce ERP

### 1. Project Vision

You are developing a professional, production-oriented E-commerce Management System using ASP.NET Core.

This application must be a complete, independently deployable business software product.

However, it must also be designed from day one to integrate with an existing multi-tenant SaaS platform called **Get Assist** (the Host Platform).

Get Assist already provides communication and business capabilities, including messaging channels, unified inbox, contacts, AI, automation, team management, permissions, and project-based workspaces.

The long-term objective is to connect this E-commerce application to Get Assist as an optional **Business Application / Plugin**.

When a Get Assist customer enables the E-commerce add-on for a project, the customer should be able to launch and use the complete E-commerce application from the Get Assist workspace.

Get Assist must also be able to request relevant E-commerce business data through secure APIs whenever its AI, messaging, contacts, or automation functions need that information.

**Important: This is NOT a request to build the Get Assist plugin framework inside the E-commerce application.**

Your responsibility is to build a complete E-commerce application with well-defined integration capabilities so that the two systems can be connected later without a major rewrite.

Do not assume that Get Assist already supports functionality that has not been verified.

---

# 2. Core Architectural Principles

Follow these requirements:

1. Build E-commerce as a standalone software product.
2. Keep its frontend, backend, database, authentication, and deployment independent.
3. Use clear internal business module boundaries.
4. Do not copy Get Assist's source code or database models into Commerce.
5. Do not directly access the Get Assist database.
6. Do not require Get Assist to be online for normal Commerce operations.
7. Expose controlled, versioned APIs for integration.
8. Support multi-tenant customers and workspaces.
9. Keep integration logic separate from core business logic.
10. Support both standalone and integrated user experiences.
11. Design for secure single sign-on without sharing application passwords or session cookies.
12. Make integrations optional and disableable without breaking Commerce.
13. Do not over-engineer or create unnecessary microservices.
14. Deliver working, customer-visible functionality in small increments.

The goal is a maintainable ERP with clean integration boundaries, not a massive framework built before actual functionality exists.

---

# 3. Preferred Technology Stack

Use the following stack unless the existing repository contains a better justified implementation:

**Backend**
- ASP.NET Core 10
- C#
- RESTful Web API
- Entity Framework Core
- PostgreSQL
- Built-in dependency injection
- OpenAPI documentation
- Structured application logging

**Frontend**
- React + Next.js
- TypeScript
- Responsive enterprise dashboard
- Reusable design components
- Accessible forms, navigation, tables, and dialogs

**Deployment**
- Linux-compatible Docker containers
- Environment-based configuration
- Independent frontend and backend deployment
- Database migrations
- Health checks
- Secure secret management

**Architecture**
- Modular Monolith
- Clear domain/application/infrastructure boundaries
- Dependency injection
- Business logic isolated from HTTP controllers
- Dedicated integration adapters

Do not create a separate deployable microservice for every ERP module.

Start with one modular backend and extract services only when there is a demonstrated operational need.

---

# 4. Required E-commerce Business Modules

Build the normal E-commerce Management System properly.

## 4.1 Organization & Administration
- Company profile
- Business settings
- Users
- Roles and permissions
- Employee access
- Multiple branches/locations where required
- Audit history
- Currency and tax configuration

## 4.2 Product Catalog
- Products
- Categories
- Brands
- SKU management
- Product variants and attributes
- Product descriptions
- Images and media
- Cost price and selling price
- Product visibility/status
- Import and export
- Product search

## 4.3 Inventory
- Warehouses
- Stock quantities
- Stock adjustments
- Stock transfers
- Stock movement history
- Low-stock alerts
- Inventory reservations
- Reorder information

## 4.4 Sales & Orders
- Orders
- Order items
- Customer information
- Order statuses
- Order history
- Invoices
- Discounts
- Returns
- Cancellations
- Refund handling
- Fulfilment status

## 4.5 Customers
- Customer profiles
- Customer addresses
- Customer order history
- Customer tags and notes
- Business customer support
- External customer ID mapping

## 4.6 Pricing, Discounts & Offers
- Base selling price
- Price changes
- Discount rules
- Promotional offers
- Offer validity dates
- Coupon codes
- Product-level promotions
- Final effective selling price calculation

## 4.7 Purchases & Suppliers
- Suppliers
- Purchase orders
- Goods received
- Purchase costs
- Supplier payments/status
- Stock updates from purchases

## 4.8 Payments & Finance
- Payment records
- Payment status
- Refund records
- Expenses
- Revenue reporting
- Cash and bank summaries
- Taxes
- Receivables and payables

Use reliable financial data types and database transactions. Never use floating-point arithmetic for monetary calculations.

## 4.9 Reporting
- Sales overview
- Revenue trends
- Order analytics
- Product performance
- Stock reports
- Customer purchase trends
- Financial summaries
- Exportable reports

## 4.10 Dashboard
Create a polished, practical business dashboard with real data:

- Total sales
- Revenue
- Orders
- Pending orders
- Products
- Low stock
- Recent transactions
- Sales charts
- Business alerts

These modules form the overall ERP scope. Implement them progressively, prioritizing complete working workflows over unfinished placeholder pages.

---

# 5. Mandatory Multi-Tenant Architecture

The application must support multiple independent business customers.

Every business customer must have isolated data.

Create an internal tenant/workspace model appropriate for Commerce.

Example conceptual entities:

- CommerceTenant
- CommerceWorkspace
- CommerceUser
- CommerceMembership
- Product
- Inventory
- Order
- Customer
- AppConnection

Each tenant-owned record must belong to the correct Commerce tenant.

If one Commerce tenant supports multiple stores or workspaces, isolate data at the appropriate workspace boundary as well.

Requirements:

- Determine tenant context from verified authentication and server-side membership.
- Never trust a tenant ID supplied by the browser without authorization.
- Enforce tenant isolation for database reads and writes.
- Apply tenant rules to background jobs, imports, exports, reports, and APIs.
- Use appropriate tenant-aware indexes and unique constraints.
- Ensure raw SQL and privileged operations cannot accidentally bypass isolation.
- Avoid exposing whether another customer's records exist.

EF Core global query filters may be used as defense in depth, but they must not be the only security mechanism.

Do not assume Get Assist customer IDs and Commerce tenant IDs are identical.

---

# 6. Get Assist Integration Architecture

Create a dedicated integration boundary.

Suggested structure:

```text
Commerce/
├── Core/
├── Modules/
│   ├── Catalog/
│   ├── Inventory/
│   ├── Orders/
│   ├── Customers/
│   ├── Pricing/
│   ├── Payments/
│   └── Reporting/
│
├── Identity/
├── Infrastructure/
│
├── Integrations/
│   ├── Contracts/
│   ├── Authentication/
│   ├── AppConnections/
│   ├── Api/
│   ├── Events/
│   └── GetAssist/
│
└── Web/
```

These are logical boundaries; adapt physical folders to the actual solution structure.

All Get Assist-specific behaviour must be implemented through interfaces or adapters.

Examples:

- `IExternalPlatformConnection`
- `IExternalIdentityProvider`
- `IWorkspaceProvisioningService`
- `ICommerceProductQueryService`
- `IIntegrationEventPublisher`

These are suggested interface names, not required fixed signatures.

Normal Commerce modules must not directly depend on Get Assist.

Get Assist integration must be optional.

Disabling the integration must not disable ordinary Commerce business operations.

---

# 7. Support Standalone and Integrated Modes

The application must support two modes.

## Standalone Mode

Customers can use Commerce directly:

- Standalone authentication
- Own application header
- Own sidebar
- Complete dashboard
- All Commerce modules
- Own account and organization settings

## Integrated Mode

A user opens Commerce through an authorized Get Assist project.

Expected experience:

- No unnecessary second login
- Commerce dashboard opens
- Commerce sidebar remains functional
- All permitted Commerce modules work
- Visual styling can match the Host Platform
- A clear "Back to Workspace" action is available
- Project and customer context are preserved
- Direct unauthorized access is refused

**Important:** Integrated Mode must not be treated as authorization.

Do not grant access merely because the URL contains `embedded=true`, a project ID, or another client-controlled value.

The final UI delivery method has not been selected.

Therefore:

- Keep the Commerce frontend independently deployable.
- Keep business pages independent from the outer application shell.
- Support an integration-specific shell configuration.
- Avoid hardcoding assumptions about iframe versus reverse-proxy routing.
- Make the final launch URL and allowed Host Platform origins configurable.
- Do not assume third-party cookies will work in an iframe.
- Do not disable framing protections globally.

The application must remain compatible with a future authenticated embedded or integrated launch mechanism.

---

# 8. Authentication and Single Sign-On Readiness

Commerce must support secure standalone authentication.

It must also be ready to accept authenticated users from an approved external identity provider or trusted platform.

Prefer standards-based OpenID Connect using Authorization Code Flow with PKCE when the Host Platform identity contract is available.

Do not invent an incompatible custom SSO protocol.

If a temporary launch-code mechanism is required for a prototype, implement it only after both applications agree on the exact contract.

Required security properties:

- Server-side validation
- Short-lived credentials
- One-time redemption where applicable
- Replay protection
- Trusted issuer verification
- Explicit audience verification
- Expiration checking
- State/nonce validation where applicable
- Approved redirect destinations
- Secure session creation
- Session revocation/logout handling
- No passwords or long-lived access tokens in URLs
- No reuse or forwarding of Get Assist's raw session cookies

The Commerce application must map the authenticated external identity to its own local Commerce user and authorized workspace.

External authentication alone must never grant all Commerce permissions.

---

# 9. External Workspace Provisioning

Commerce must support the future installation process.

Expected workflow:

1. A Get Assist administrator creates or selects a project.
2. The administrator enables Commerce as an add-on.
3. Get Assist sends an authenticated provisioning request.
4. Commerce creates or finds the mapped workspace.
5. Commerce returns the external workspace reference.
6. Get Assist records the connection status.
7. Authorized users can launch Commerce.

Support the alternative of connecting an existing Commerce workspace later.

Design a connection mapping concept containing:

- Host platform identifier
- Host customer identifier
- Host project identifier
- Commerce tenant identifier
- Commerce workspace identifier
- Connection status
- Created/updated timestamps
- Credential references
- External API contract version

The exact schema may change during integration agreement.

Provisioning requirements:

- Requests must be authenticated.
- Duplicate requests must be idempotent.
- Repeated installation must not create duplicate workspaces.
- The server must verify ownership before linking existing workspaces.
- Failed provisioning must return a clear error.
- An unavailable external platform must not block normal Commerce operations.
- Disable and reconnect operations must be supported.
- Disconnecting must not automatically delete business data.

Do not hardcode Get Assist's internal project database IDs into Commerce business tables.

Keep external ID mapping in the integration layer.

---

# 10. Mandatory Integration APIs

Build a secure, versioned API surface that Get Assist can use to retrieve Commerce business data.

The names below are a proposed Commerce API design, NOT claims about existing Get Assist endpoints.

## Product APIs

```http
GET /api/v1/integrations/products/search
GET /api/v1/integrations/products/{id}
GET /api/v1/integrations/products/{id}/availability
GET /api/v1/integrations/products/{id}/pricing
GET /api/v1/integrations/offers/active
```

Support:

- Product search
- SKU lookup
- Product availability
- Current selling price
- Currency
- Active offers
- Offer validity
- Public product description
- Relevant media URLs

Do not expose internal cost price, supplier cost, margin, or confidential inventory information through customer-facing AI scopes unless explicitly authorized.

## Customer APIs

```http
GET /api/v1/integrations/customers/search
GET /api/v1/integrations/customers/{id}
GET /api/v1/integrations/customers/{id}/orders
```

Require appropriate customer-data permissions.

Do not let a customer's phone number alone authorize access to private order history.

## Order APIs

```http
GET /api/v1/integrations/orders/{id}
GET /api/v1/integrations/orders/{id}/status
```

Future write APIs, such as order creation, cancellation, or refunds, must use separate explicit permissions and confirmation workflows.

## Standard API Requirements

- OpenAPI documentation
- Stable versioned routes
- Consistent response structures
- Pagination
- Search/filter support
- Explicit currency and decimal precision
- Machine-readable error codes
- Validation
- Rate limiting
- Request correlation IDs
- Server-side tenant authorization
- Scope-based authorization
- Timeouts and cancellation support
- Appropriate caching rules

Never make private integration endpoints accessible without authentication.

---

# 11. AI Integration Readiness

Get Assist already has its own AI and messaging capabilities.

Commerce should NOT build another complete conversational AI engine just to integrate with Get Assist.

Instead, Commerce must expose trusted business capabilities that Get Assist AI can call when needed.

Required read-only AI capabilities:

```text
commerce.searchProducts
commerce.getProduct
commerce.getEffectivePrice
commerce.checkAvailability
commerce.getActiveOffers
commerce.getOrderStatus
```

These are logical tool names. Final tool schemas must be agreed with Get Assist.

Examples:

Customer asks:
"Do you have Samsung A56?"

Get Assist AI calls Commerce product search.

Customer asks:
"What is the price?"

Get Assist AI calls current pricing.

Customer asks:
"Is there any discount?"

Get Assist AI calls active offers.

Customer asks:
"Where is my order?"

Get Assist must verify the customer's identity and order access before calling the appropriate Commerce endpoint.

Important rules:

1. Commerce remains the source of truth for products, prices, inventory, and offers.
2. AI must never calculate or invent prices independently.
3. Effective price must come from Commerce business logic.
4. Expired offers must not be returned as active.
5. Private customer data requires verified authorization.
6. API errors must be distinguishable from empty search results.
7. Commerce must not execute arbitrary AI-generated database queries.
8. AI tools must expose narrow, typed business operations.
9. Write operations must be separated from read operations.
10. Sensitive actions require additional authorization or customer confirmation.

Prefer real-time queries for current prices and availability.

Caching may be added later with explicit TTL and invalidation policies.

---

# 12. Event-Driven Integration

Commerce must support publishing relevant business events to approved external systems.

Initial event catalogue:

```text
commerce.product.created
commerce.product.updated
commerce.stock.changed
commerce.price.changed
commerce.offer.activated
commerce.offer.expired

commerce.order.created
commerce.order.confirmed
commerce.order.cancelled
commerce.order.shipped
commerce.order.delivered

commerce.payment.recorded
commerce.payment.failed
commerce.refund.completed
```

Use a versioned event envelope with fields such as:

```json
{
  "id": "event-uuid",
  "type": "commerce.order.confirmed",
  "version": 1,
  "occurredAt": "2026-11-14T07:00:00Z",
  "workspaceId": "commerce-workspace-id",
  "subjectId": "order-id",
  "data": {
    "orderNumber": "ORD-1001",
    "status": "CONFIRMED"
  }
}
```

Treat this as a proposed contract.

Do not send complete customer records or sensitive financial information unless the receiving system explicitly needs and is authorized to receive it.

Event delivery requirements:

- Durable event storage
- Transactional outbox or an equivalent reliable mechanism
- Asynchronous delivery
- Retry with bounded exponential backoff
- Signed delivery or authenticated transport
- Unique event IDs
- Idempotent consumers
- Delivery logs
- Dead-letter or failed-delivery visibility
- Manual retry where appropriate
- No duplicate external business effects

Get Assist will eventually subscribe to the events it supports.

Do not assume its current webhook endpoint accepts these proposed events.

---

# 13. Customer & Contact Mapping

Get Assist has its own contact/client data.

Commerce has customer profiles and order histories.

Do not automatically copy every contact into both databases.

Create an optional mapping mechanism:

```text
Get Assist Contact
        |
        | External Reference
        v
Commerce Customer
        |
        +-- Orders
        +-- Payments
        +-- Addresses
        +-- Purchase History
```

Design for:

- External customer references
- Source-system identification
- Verified linking
- Duplicate detection
- Unlinking
- Privacy-aware synchronization
- Explicit data ownership
- Conflict handling

Phone number and email matching may suggest possible matches, but must not automatically grant access to private records.

Commerce customer data remains owned by Commerce unless a separate agreement defines otherwise.

---

# 14. Bidirectional Integration

The integration must be able to work in both directions.

## Get Assist → Commerce

Examples:

- AI requests product information.
- Inbox requests an order summary.
- Automation requests current order status.
- User opens Commerce from a project workspace.

## Commerce → Get Assist

Examples:

- Order confirmation event
- Delivery update
- Payment reminder request
- Customer conversation deep link
- Authorized messaging or automation request

Do not directly connect Commerce to Get Assist's internal WhatsApp sending worker.

Use approved Get Assist APIs and event contracts.

The current Get Assist public API may not support every operation needed here.

Implement Commerce-side adapters and document missing Host Platform capabilities rather than inventing working endpoints.

---

# 15. Integration Lifecycle Management

Support the following connection states:

```text
NOT_CONNECTED
PENDING
CONNECTING
ACTIVE
ERROR
DISABLED
REVOKED
```

Exact state names can be refined later.

Provide a Commerce integration settings area that can display:

- Get Assist connection status
- Connected workspace
- Last successful connection
- API compatibility/version
- Last integration error
- Reconnect action
- Disable/disconnect action

When disabled:

- Commerce continues working independently.
- Get Assist API access is revoked or refused.
- Event delivery to Get Assist stops according to policy.
- Existing business data is preserved.
- Reconnection remains possible.

Do not delete customers, products, orders, or payments simply because an integration is disconnected.

---

# 16. Shared UI Design Compatibility

The Commerce UI must be modern, polished, responsive, and enterprise-grade.

Use a reusable design system.

Keep these elements configurable:

- Color tokens
- Typography
- Borders and radius
- Surface styles
- Navigation
- Density
- Theme
- Logo and branding

Commerce must support its own standalone brand.

It should also support applying an approved Host Platform theme when opened through Get Assist.

Do not hardcode Get Assist-specific branding throughout the Commerce business screens.

Design the outer application shell separately from business pages.

This enables future UI integration without rebuilding Products, Orders, Inventory, Finance, and Reports screens.

---

# 17. Security Requirements

Mandatory:

- Tenant isolation
- Project/workspace authorization
- Role-based access control
- Authentication on every protected operation
- Secure credential storage
- No hardcoded secrets
- HTTPS in production
- Input validation
- CSRF protection where applicable
- Safe file uploads
- Audit logs
- Rate limiting
- Secure API tokens
- Secret rotation and revocation
- Integration access revocation
- Sensitive-data redaction in logs
- No arbitrary external code execution
- No cross-tenant data exposure

Where iframe embedding is supported, configure an explicit allowlist of trusted parent origins.

Do not set unrestricted embedding policies.

Where browser-to-frame communication exists, validate message origins and message schemas.

Use least-privilege access scopes for external integrations.

---

# 18. Performance & Deployment Requirements

The ERP must remain fast and independently deployable.

Requirements:

- Server-side pagination for large tables
- Search and database indexing
- Efficient stock and order queries
- Avoid unnecessary database round trips
- Background processing for heavy tasks
- Safe transaction handling
- Lazy-loaded frontend screens where appropriate
- Loading and error states
- Health/readiness endpoints
- Container-based deployment
- Migration and rollback strategy
- Backup and restore documentation
- Environment variables for external service URLs
- Structured logs and basic operational metrics

Get Assist availability must not be required for ordinary Commerce sales, stock adjustments, or order processing.

Get Assist integration failures must not corrupt Commerce transactions.

---

# 19. Documentation That Must Be Delivered

Create and maintain these documents:

```text
docs/
  ARCHITECTURE.md
  BUSINESS_MODULES.md
  MULTI_TENANCY.md
  API_CONTRACT.md
  GET_ASSIST_INTEGRATION.md
  SSO_INTEGRATION.md
  EVENTS_AND_WEBHOOKS.md
  DATA_OWNERSHIP.md
  DEPLOYMENT.md
```

The most important document is:

**GET_ASSIST_INTEGRATION.md**

It must explain:

1. How Commerce connects to the Host Platform.
2. How a Host Platform project maps to a Commerce workspace.
3. How installation/provisioning works.
4. How SSO will work.
5. How the full Commerce UI can be opened.
6. What APIs Commerce provides.
7. What events Commerce emits.
8. What Get Assist APIs are required.
9. What permissions and scopes are needed.
10. How connection status, disabling, and reconnection work.
11. What has been implemented and what still depends on Get Assist.
12. The exact integration contract version.

Use real implementation references. Do not describe planned functions as completed.

---

# 20. Required Development Milestones

Implement incrementally.

## Milestone 1 — Foundation

Deliver:
- Working ASP.NET Core backend
- Working React/Next.js frontend
- PostgreSQL database
- Tenant/workspace foundation
- Authentication
- Authorization
- Responsive application shell
- Dashboard foundation
- Docker development setup

## Milestone 2 — Commerce Fundamentals

Deliver:
- Product CRUD
- Categories
- Product variants
- Pricing
- Inventory
- Customer management
- Working order workflow

Use real persisted data.

## Milestone 3 — Integration Readiness

Deliver:
- External platform connection model
- Authenticated provisioning contract
- Workspace mapping
- Integration API endpoints
- OpenAPI documentation
- Stable product/pricing/stock query services
- Secure integrated-launch interface
- Connection status handling

Do not claim Get Assist SSO works until both sides are implemented and tested.

## Milestone 4 — Business Events

Deliver:
- Reliable event outbox
- Relevant Commerce events
- Authenticated webhook delivery
- Retry and duplicate protection
- Integration logs

## Milestone 5 — Complete ERP Expansion

Continue implementing:
- Purchasing
- Suppliers
- Warehouses
- Fulfilment
- Returns and refunds
- Finance
- Business reporting
- Advanced operational workflows

Keep previously completed functionality working.

---

# 21. Minimum Integration Acceptance Tests

Before declaring the integration-ready foundation complete, verify:

1. Two Commerce tenants cannot access each other's products, orders, or customers.
2. Unauthorized users cannot open another workspace.
3. Repeated provisioning does not create duplicate workspaces.
4. Revoked integration credentials stop working.
5. Disabled connections cannot access integration APIs.
6. Product APIs return the correct tenant's current price, stock, and offers.
7. An AI-facing read-only credential cannot perform order or payment mutations.
8. Retried events do not cause duplicate business operations.
9. Commerce continues working when Get Assist is unavailable.
10. Standalone and integrated application shells use the same actual Commerce business functionality.

Use focused automated tests and a small working demonstration.

Do not substitute excessive test scaffolding for actual completed product features.

---

# 22. Important Restrictions

DO NOT:

- Rebuild Get Assist communication functionality inside Commerce.
- Move Commerce business logic into Get Assist.
- Share database tables directly between the applications.
- Assume external project IDs are trustworthy authorization credentials.
- Hardcode Get Assist API URLs into domain logic.
- Copy Get Assist authentication cookies.
- Expose private APIs publicly.
- Give AI unrestricted database access.
- Make Commerce dependent on Get Assist uptime.
- Build a full public plugin marketplace.
- Create unnecessary microservices.
- Introduce complex infrastructure before it is required.
- Claim an integration works based only on mocked responses.
- Implement pricing/subscription integration before its contract is approved.
- Rewrite working modules simply to accommodate a future integration.

---

# 23. Expected Final Result

The completed Commerce application must be:

**A. A fully usable standalone E-commerce ERP.**

**B. A multi-tenant business application with proper isolation and permissions.**

**C. Independently deployable and maintainable.**

**D. Ready to be installed as a connected business application inside Get Assist.**

**E. Capable of exposing trusted business data to Get Assist AI and automation.**

**F. Capable of publishing business events to Get Assist through a secure integration.**

**G. Designed so Get Assist can open the full Commerce UI without rewriting Commerce's business screens.**

The application must continue functioning when disconnected from Get Assist.

---

# 24. Your First Task

Before implementing everything:

1. Inspect the current Commerce repository if one exists.
2. Identify what is already implemented.
3. Create a concise architecture and module-gap report.
4. Propose the simplest maintainable project structure.
5. Clearly separate standalone ERP requirements from integration requirements.
6. Identify any decisions that require agreement with the Get Assist team.
7. Prepare the first working milestone.
8. Begin implementation in small, functional increments.

Do not pretend that unspecified Get Assist endpoints, SSO providers, plugin APIs, or SDKs already exist.

If the Get Assist repository is accessible, inspect its actual contracts before implementing the corresponding connector:

https://github.com/MDMahmudulHasanRudra/Support-Message-Automation

Verify the current branch, code, and documentation. Do not assume that previous architecture notes describe the latest implementation.

**Your ultimate goal is to build a professional, complete E-commerce ERP that can later integrate with Get Assist securely, with minimal changes to the existing applications.**
