# Frontend Gap Analysis & Implementation Plan

This document maps every requirement across `E-Commerce.md`, `docs/BUSINESS_MODULES.md`, `docs/API_CONTRACT.md`, `docs/GET_ASSIST_INTEGRATION.md`, `docs/EVENTS_AND_WEBHOOKS.md`, and `README.md` against the Next.js frontend, separating **existing backend endpoints that lack UI** from **future backend endpoints** to design later.

---

## 1. Existing Backend APIs Missing Frontend UI (Wire Immediately)

| Module | Backend Endpoint | Missing Frontend Functionality | Target Route / Component |
| --- | --- | --- | --- |
| Auth | `POST /api/v1/auth/register` | Tenant & workspace sign-up flow | `src/app/register/page.tsx` + link on `/login` |
| Auth / Shell | `GET /api/v1/auth/me` | User profile & permissions inspection | `src/app/(app)/settings/page.tsx` |
| Catalog | `GET/POST/PUT/DELETE /api/v1/categories` | Category hierarchy CRUD UI | `src/app/(app)/categories/page.tsx` |
| Catalog | `GET/POST/PUT/DELETE /api/v1/brands` | Brand CRUD + logo preview UI | `src/app/(app)/brands/page.tsx` |
| Catalog | `POST/PUT /api/v1/products` (`variants`, `images`) | Variant & attribute JSON editor, live image gallery preview | `src/components/ProductForm.tsx`, `/products`, `/products/[id]` |
| Catalog | `GET /api/v1/products?lowStock=true` | Low-stock filter toggle & CSV template guide | `src/app/(app)/products/page.tsx` |
| Inventory | `PUT/DELETE /api/v1/warehouses/{id}` | Edit & delete warehouse actions | `src/app/(app)/inventory/page.tsx` |
| Inventory | `GET /api/v1/inventory/movements?variantId=&type=` | Variant filter + `Reservation`/`Release` movement types | `src/app/(app)/inventory/page.tsx` |
| Orders | `GET /api/v1/orders/{id}/invoice` | Printable tax invoice view (`window.print()`) | `src/app/(app)/orders/[id]/invoice/page.tsx` |
| Orders | `GET /api/v1/orders?from=&to=&customerId=` | Date range & customer filters | `src/app/(app)/orders/page.tsx` |
| Orders | `POST /api/v1/orders` (`shippingAddressJson`, `source`) | Customer address picker / custom shipping address + live quote | `src/components/NewOrderModal.tsx` |
| Orders | `POST /api/v1/orders/{id}/returns` (`itemsJson`) | Line-item return selector & suggested refund amount | `src/app/(app)/orders/[id]/page.tsx` |
| Customers | `GET /api/v1/customers/duplicates` | Duplicate detection modal + live warning on create | `src/app/(app)/customers/page.tsx`, `CustomerForm.tsx` |
| Customers | `GET /api/v1/customers?tag=` | Tag filter + working Email action + Quick Order | `src/app/(app)/customers/page.tsx`, `/customers/[id]` |
| Pricing | `POST /api/v1/pricing/quote` | Interactive effective-price & coupon simulator | `src/app/(app)/offers/page.tsx` |
| Settings | `GET /api/v1/settings/workspaces` | Workspaces & branches management tab | `src/app/(app)/settings/page.tsx` |
| Integration | `GET /api/v1/integrations/*` | Interactive Read-API & AI tool tester + event catalog | `src/app/(app)/integration/page.tsx` |

---

## 2. Frontend-First Features (backend endpoints shipped)

These features implement the remaining specifications in `E-Commerce.md` and `docs/BUSINESS_MODULES.md` on the frontend first, with graceful handling until the corresponding backend endpoints are designed:

1. **Reorder Point & Quantity Editor (`E-Commerce.md` §4.3, `BUSINESS_MODULES.md` §Inventory)**
   - Live through `PUT /api/v1/inventory/reorder` (`{ warehouseId, variantId, reorderPoint, reorderQuantity }`).
2. **Product Price History & Stock Quick-Adjust (`E-Commerce.md` §4.6)**
   - Live through `GET /api/v1/products/{id}/price-history`, rendered on the product detail page.
3. **Branch / Workspace Creation (`E-Commerce.md` §4.1)**
   - Live through `POST /api/v1/settings/workspaces` (`{ name, currencyCode, timeZone }`).
4. **Password Change (`E-Commerce.md` §8)**
   - Live through `POST /api/v1/auth/change-password` (`{ currentPassword, newPassword }`).
5. **Configurable Shell Theme, Density & Integrated Mode (`E-Commerce.md` §7, §16)**
   - Client-side token system (`src/lib/theme.tsx`) supporting Standalone vs Integrated Mode (`?embedded=true` / Host launch context, "Back to Workspace" action, theme presets, compact/comfortable density, configurable brand name).
6. **Global Command Palette (`⌘K`) & Role-Aware UI (`E-Commerce.md` §4.1, §17)**
   - `src/components/CommandPalette.tsx` searches Products, Orders, Customers, and Navigation routes via existing APIs.
   - `src/lib/permissions.ts` provides role/permission helpers matching `API_CONTRACT.md` authorization policies.
7. **Purchasing & Finance Operational Views (`E-Commerce.md` §4.7–4.8)**
   - Supplier detail modal, low-stock auto-fill inside New Purchase Order, Receivables & Payables breakdown tab in Finance, Payment detail modal, and CSV export of payments/expenses.

---

## 3. Target Frontend Folder & File Additions

```text
frontend/src/
  lib/
    permissions.ts          # Role & permission helpers matching backend policies
    theme.tsx               # Shell config, theme tokens, density, integrated mode state
    csv.ts                  # Client-side CSV helpers & product import template
  components/
    CommandPalette.tsx      # Global Ctrl/Cmd+K quick search across products, orders, customers & routes
    AppShell.tsx            # Updated with Categories/Brands nav, Integrated Mode banner & Back to Workspace, Theme/Density
    ProductForm.tsx         # Upgraded with full Variants & Attributes editor + Image gallery manager
    NewOrderModal.tsx       # Upgraded with customer address picker, custom shipping address & live server quote
    CustomerForm.tsx        # Upgraded with live duplicate email/phone detection banner
    icons.tsx               # Additional icons (printer, palette, key, building, layers, etc.)
  app/
    register/page.tsx       # Standalone Tenant & Workspace registration page
    (app)/
      categories/page.tsx   # Categories CRUD & hierarchy view
      brands/page.tsx       # Brands CRUD & logo preview view
      orders/[id]/invoice/page.tsx # Printable tax invoice page
```

---

## 4. Status (2026-11-28)

Every item in §1 and §2 is implemented and the previously planned endpoints
now ship:

| Method | Path | Behaviour |
| --- | --- | --- |
| PUT | `/api/v1/inventory/reorder` | Reorder thresholds per warehouse + variant |
| GET | `/api/v1/products/{id}/price-history` | Variant price changes on product detail |
| POST | `/api/v1/settings/workspaces` | Branch + membership + default `MAIN` warehouse |
| POST | `/api/v1/auth/change-password` | Verifies current password, revokes refresh tokens |

Remaining deliberate gaps are listed in `BUSINESS_MODULES.md` § Deliberate gaps.
