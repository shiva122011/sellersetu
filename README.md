# SellerSetu

A full-stack **service request → quotation → vendor-managed delivery** platform for e-commerce seller services (150 services across 16 configurable categories), built with Next.js 16, TypeScript, Tailwind CSS 4, shadcn/ui and Prisma (SQLite by default).

> **Note:** SellerSetu is an independent platform and is not affiliated with Amazon. It does not integrate with or use the Amazon SP-API.

---

## 1. What it does

SellerSetu connects **clients (sellers)** with a service team and its **vendor partners**:

1. A client picks services from a public catalog (16 categories × detailed service pages with scope, deliverables, delivery process and FAQs — no public fixed pricing).
2. They submit a structured request (dynamic intake forms per service, file/document checklists).
3. Staff review the request, prepare a **custom quotation** (line items + one of three execution models), and the client accepts it.
4. Accepting a quotation **locks it as a commercial record** and automatically creates a **Project** with milestones, tasks, work submissions, chat and activity timeline.
5. Connected **vendors** execute assigned work inside their own portal (requirements spec, tasks, deliverables), while staff retain full oversight.

### Execution models

| Model | Meaning |
|---|---|
| `IN_HOUSE` | Delivered by SellerSetu's own team |
| `THIRD_PARTY_MANAGED` | A vendor executes; SellerSetu manages and charges a managed fee (fee note is **staff-only visible**) |
| `DIRECT_VENDOR` | Client is connected directly to the vendor |

### Key business rules (enforced in code)

- **No public fixed pricing** — every service is quotation-based; the catalog never shows prices.
- **Quotations are immutable commercial records** once accepted.
- `managedFeeNote` / internal vendor `notes` are **stripped from every API response** for non-staff roles.
- **Vendor payouts**: on managed projects, the vendor sees their own milestone payout (`vendorPayoutAmount` + release status) but never the client's per-milestone billing; customers never see vendor payout data. Payout release/revert is staff-only and notifies the vendor.
- The full service catalog (categories, services, scope, deliverables, process, FAQs) is **admin-configurable** from the backend UI — nothing is hard-coded in the frontend.

---

## 2. Roles

| Role | Portal | Highlights |
|---|---|---|
| `CUSTOMER` | Client dashboard | Requests, quotations, payments (50/50 advance+final), documents, 1-to-1 chat, invoices, notifications |
| `VENDOR` | Vendor portal | Assigned projects, full requirement specs, tasks, deliverables, chat, company profile + payout details, milestone payouts view |
| `EMPLOYEE` | Staff console | Requests, quotations, projects, task execution, chat |
| `PROJECT_MANAGER` / `OPS_MANAGER` / `SALES_EXEC` | Staff console (role-scoped) | Role-gated access to management surfaces |
| `ADMIN` / `SUPER_ADMIN` | Admin console | Vendors & connections, catalog/CMS editor, pricing governance, invoices/refunds, credentials vault, reports, settings, audit log |

---

## 3. Tech stack

- **Next.js 16** (App Router, standalone output) + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** components
- **Prisma ORM** — SQLite by default (single file), portable to Postgres
- **Auth** — bcrypt password hashing, JWT session in an HttpOnly cookie (`jose`), role-based access on every route
- **Socket.io** — 1-to-1 chat + notifications (short-lived socket tokens via `/api/socket-token`)
- **QA** — 86-assertion lifecycle suite (`scripts/qa-lifecycle.ts`) covering the full business flow incl. RBAC negatives and vendor payout flows

---

## 4. Getting started

### Prerequisites

- Node.js 20+ (or Bun) and npm
- (SQLite ships with the repo — no external DB needed)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   → set DATABASE_URL and AUTH_SECRET (see .env.example comments)

# 3. Create the database schema
npx prisma db push

# 4. Seed demo data (16 categories / 150 services / demo users / vendors / CMS)
bun scripts/seed.ts

# 5. Run
npm run dev          # development, http://localhost:3000
```

### Demo credentials (after seeding)

| Role | Email | Password |
|---|---|---|
| Admin (SUPER_ADMIN) | `admin@sellersetu.in` | `Admin@123` |
| Ops Manager | `ops@sellersetu.in` | `Ops@123` |
| Sales Exec | `sales@sellersetu.in` | `Sales@123` |
| Project Manager | `pm@sellersetu.in` | `Pm@123` |
| Employee | `meera@sellersetu.in` | `Team@123` |
| Client | `rahul@example.com` | `Customer@123` |
| Client | `priya@example.com` | `Customer@123` |
| Vendor (approved) | `studio.kriya@example.com` | `Vendor@123` |
| Vendor (approved) | `sales.packpro@example.com` | `Vendor@123` |
| Vendor (pending approval) | `hello.printbazaar@example.com` | `Vendor@123` |

> ⚠️ Demo passwords are for local/demo use only — change them before any real deployment.

---

## 5. Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build (standalone) + copies static/public assets |
| `npm start` | Serves the standalone production build |
| `npm run lint` | ESLint |
| `npm run db:push` | Push `prisma/schema.prisma` to the database |
| `bun scripts/seed.ts` | Seed demo data (idempotent reseed: wipes + recreates) |
| `bun scripts/qa-lifecycle.ts` | 86-assertion end-to-end API lifecycle + RBAC suite |
| `bun scripts/seed-catalog.ts` | Catalog-only reseed from `scripts/seed-catalog.ts` (single source of truth shared with the full seed) |

---

## 6. Deployment notes

- **Build**: `npm run build` produces a standalone server at `.next/standalone/server.js` (static assets are copied automatically by the build script).
- **Health probe**: `GET /api/health` returns DB status + latency, `503` on DB failure, always `no-store` — wire it to your load balancer / uptime monitor.
- **Environment**: set `AUTH_SECRET` (mandatory) and `AUTH_COOKIE_SECURE=true` (behind HTTPS). See `.env.example`.
- **Security headers**: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` are set in `next.config.ts`.
- **Uploads** are stored outside `public/` and served through authenticated download routes (path-traversal safe).
- **Logging in**: the login page is at `/` → sign in; every API route re-validates role + ownership server-side.

### Porting to Postgres

1. Change `provider = "sqlite"` → `"postgresql"` in `prisma/schema.prisma`.
2. Set `DATABASE_URL` to your Postgres connection string.
3. `npx prisma db push` and re-seed.

---

## 7. Project structure

```
prisma/schema.prisma        # 27 models: users, catalog, requests, quotations,
                            # projects, vendors, documents, payments, CMS…
scripts/
  seed.ts                   # full demo seed (uses seed-catalog + service-details)
  seed-catalog.ts           # 16-category catalog definition (single source of truth)
  service-details/          # per-service descriptions, scope, deliverables,
                            # process + per-category FAQs (150/150 covered)
  qa-lifecycle.ts           # 74-assertion lifecycle + RBAC QA suite
src/app/api/                # REST API (auth, catalog, requests, quotations,
                            # projects, vendors, documents, payments, invoices,
                            # refunds, admin, notifications, health…)
src/app/page.tsx            # public landing + catalog + service detail
src/components/             # dashboards per role, shared UI
public/logos/               # platform mark + company logos (SVG-style PNGs)
```

---

## 8. Quality gates

- `npx tsc --noEmit` — clean
- `npx eslint .` — 0 errors / 0 warnings
- `bun scripts/qa-lifecycle.ts` — **86/86 PASS**
- Production standalone build verified (health, security headers, login flow, HttpOnly cookies)
- Browser E2E passes across landing, client, staff, admin and vendor surfaces incl. mobile (390px)
