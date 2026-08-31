# Autobody Service Station

A full-stack management system for a vehicle **body & detailing** service
station — wash, wax, polish, paint correction, ceramic coating, dent/scratch
removal, and interior detailing. This is exterior/interior cosmetic work
only; there is no mechanical repair, engine work, or parts-replacement
functionality anywhere in the system, by design.

## Architecture overview

Monorepo with two independent apps sharing one Postgres database:

```
/backend    Node.js + Express + TypeScript + Prisma ORM, JWT auth
/frontend   React + TypeScript (Vite) + Tailwind CSS, React Router
```

- **Database**: PostgreSQL (via Docker Compose for local dev). Prisma manages
  the schema and migrations — see `backend/prisma/schema.prisma` for the full
  data model (staff, customers, vehicles, service catalog, bookings, job
  cards, damage inspections, photos, inventory, invoices/payments, reviews,
  notifications).
- **Auth**: two independent JWT flows sharing one signing secret —
  `/auth/*` for staff (role-gated: ADMIN, MANAGER, TECHNICIAN,
  RECEPTIONIST) and `/customer-auth/*` for customers. Staff registration is
  bootstrap-only: the very first account created becomes ADMIN and every
  registration after that requires an authenticated ADMIN caller.
- **File uploads** (job photos, payment slips): stored on local disk under
  `backend/uploads/` for this dev pass and served statically at `/uploads`.
  See **Next steps for production** below for where cloud storage plugs in.
- **Notifications**: a stub service (`backend/src/services/notificationService.ts`)
  that logs and marks records `SENT` — see the same section for where a real
  SMS/email provider plugs in.
- **Payments**: bank transfer + slip upload only, verified manually by staff.
  No online payment gateway is integrated in this pass.
- **Frontend** is two separate single-page apps sharing one React Router
  tree and one Vite build:
  - `/…` — the staff/admin dashboard (login, customers, catalog, bookings,
    job-card Kanban board, damage-inspection tool, invoices/payment
    verification, inventory, reports, staff management)
  - `/portal/…` — the customer portal (register/login, book a service,
    booking history + status tracker, photos/damage diagrams, pay an
    invoice, loyalty points, reviews)

  The two use separate JWTs stored under separate `localStorage` keys, so a
  staff session and a customer session can coexist in the same browser
  (handy for testing both sides at once).

## Prerequisites

- Node.js 20+
- Docker (for local Postgres) — or substitute a free-tier hosted Postgres
  (see below)

## Setup

```bash
# 1. Start Postgres
docker compose up -d

# 2. Backend: install deps, configure env, migrate, seed
cd backend
npm install
cp .env.example .env        # defaults already match docker-compose.yml
npx prisma generate
npx prisma migrate deploy   # applies the committed migration
npm run seed                # creates demo staff, customers, catalog, bays

# 3. Frontend: install deps, configure env
cd ../frontend
npm install
cp .env.example .env        # defaults already point at the backend below
```

Run both dev servers (in separate terminals):

```bash
cd backend && npm run dev      # http://localhost:4001
cd frontend && npm run dev     # http://localhost:5180
```

Open **http://localhost:5180/login** for the staff dashboard, or
**http://localhost:5180/portal/login** for the customer portal.

> **Ports**: the backend defaults to `4001` and the frontend to `5180`
> (set in `backend/.env` `PORT` and `frontend/vite.config.ts` respectively)
> rather than the more common `4000`/`5173`, only because those were already
> occupied by unrelated processes in the reference dev environment this was
> built in. Change them freely — just keep `backend/.env`'s `CORS_ORIGIN`
> and `frontend/.env`'s `VITE_API_URL` in sync with whatever you pick.

### Schema changes without an interactive terminal

`prisma migrate dev` requires a TTY (it prompts for confirmations) and will
refuse to run in a non-interactive shell/CI. If you need to add a migration
in such an environment, use the diff-and-deploy pattern instead:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/<timestamp>_<name>/migration.sql
npx prisma migrate deploy
```

(In a normal terminal, just use `npm run prisma:migrate` as usual.)

### Seeded demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@autobody.test` | `StaffPass123!` |
| Manager | `manager@autobody.test` | `StaffPass123!` |
| Receptionist | `reception@autobody.test` | `StaffPass123!` |
| Technician ×3 | `tech1@autobody.test` / `tech2@autobody.test` / `tech3@autobody.test` | `StaffPass123!` |
| Customer ×3 | `nadeesha@example.com` / `chathura@example.com` / `sanduni.w@example.com` | `CustomerPass123!` |

The seed also creates a full exterior + interior service catalog priced
across every vehicle type, one bundled service package, 2 bays, and sample
customers with vehicles. It's safe to re-run (`npm run seed`) — it upserts
by unique fields and skips anything that already exists.

## Environment variables

**`backend/.env`** (see `backend/.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signing secret for both staff and customer JWTs — change this for any real deployment |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `PORT` | Backend HTTP port |
| `UPLOAD_DIR` | Local directory for uploaded photos/slips (default `uploads`) |
| `CORS_ORIGIN` | Allowed frontend origin |

**`frontend/.env`** (see `frontend/.env.example`):

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Base URL of the backend API |

## Project structure

```
backend/
  prisma/
    schema.prisma       Full data model
    migrations/          Committed SQL migrations
    seed.ts              Demo data seed script
  src/
    index.ts             Express app entry point
    routes/               One file per resource, wires middleware to controllers
    controllers/          Request handling, calls services
    services/              Business logic (booking transitions, invoicing, reports, ...)
    middleware/           auth, role gating, validation, upload, error handling
    utils/                 prisma client, jwt, zod schemas, shared select shapes

frontend/
  src/
    api/                  One module per resource; axios clients (staff + customer)
    pages/                 Staff dashboard pages
    pages/portal/           Customer portal pages
    components/            Shared UI (layout, modal, status badge/stepper, car diagram, ...)
    context/ hooks/         Auth state for both staff and customer sessions
```

## Next steps for production

This build intentionally keeps a few things simple for local development.
Before deploying for real:

- **File storage**: photos and payment slips are written to local disk
  (`backend/uploads/`) and served statically. Swap
  `backend/src/middleware/upload.ts`'s disk storage for an S3-compatible
  adapter (AWS S3, Cloudflare R2, or Supabase Storage's S3-compatible API)
  that uploads the buffer and returns a signed/public URL instead of a
  local path. The upload middleware and the `Photo.url` / `Payment.slipUrl`
  fields don't need to change shape — just what populates them.
- **Notifications**: `backend/src/services/notificationService.ts` is a
  stub that logs and marks records `SENT`. Plug in Twilio (SMS) and
  SendGrid/Postmark/Resend (email) there — the call sites (booking
  CONFIRMED, job READY) are already wired up.
- **Online payments**: currently bank transfer + slip upload, verified
  manually by staff, is the only payment path. Add a real gateway (Stripe,
  PayHere, or a regional equivalent) as an additional `PaymentMethod`
  alongside `BANK_TRANSFER`, with a webhook to auto-verify instead of the
  manual staff review step.
- **Database**: swap the local Docker Postgres for a managed free-tier
  instance — Neon or Supabase both work as drop-in Postgres and only
  require updating `DATABASE_URL`.
- **Hosting**: Railway or Render's free tier both work well for the
  Express backend (with a managed Postgres add-on, or point at Neon/
  Supabase); Vercel or Netlify for the Vite frontend. Set `CORS_ORIGIN` on
  the backend and `VITE_API_URL` on the frontend to the deployed URLs.
- **Secrets**: rotate `JWT_SECRET` to a long random value and never commit
  `.env` files (already gitignored here).
