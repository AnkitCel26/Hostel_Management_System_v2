# Hostel Management System

React + TypeScript frontend and Node.js + TypeScript GraphQL backend for managing
PG/hostel properties, rooms, tenants, rent payments, complaints, announcements,
tenant documents, and dashboards.

## Status

- Phase 1 — Project Foundation: complete
- Phase 2 — Database and Core Entities: complete (entities, relations, migrations, GraphQL base types)
- Phase 3 — Authentication (backend): complete (JWT + bcrypt, HTTP-only cookies, auth service, guards, role protection)
- Phase 3 — Authentication (frontend): complete (AuthContext, silent token refresh, protected routes, login/register/profile forms)
- Phase 4 — PG and Room Management: complete (backend PG/room CRUD + search/pagination; frontend admin sidebar layout, PG Management page, Room Management page, tenant My Room page)
- Phase 5 — Tenant Management (backend): complete (tenant CRUD + user/PG/room assignment, transactional reassignment with row locking, searchable/paginated tenant list, verifyPhase5 script)
- Phase 6 — Rent and Payment Management: complete (derived payment status, transactional payment CRUD, admin list/summary/history, tenant history, verifyPhase6 script)
- Phase 7 — Complaint Management: complete (tenant filing, admin triage/resolve, status chips, verifyPhase7 script)
- Phase 8 — Announcement Management: complete (per-property announcements, admin publish/edit/delete, tenant feed, verifyPhase8 script)
- Phase 9 — Tenant Documents: complete (Supabase storage bucket, upload/update/delete, tenant-only document UI, verifyPhase9 script)
- Phase 10 — Dashboards and UX Completion: complete (backend `getAdminDashboardStats` aggregate query, admin dashboard with summary cards/occupancy chart/payment-status donut/recent activity/quick actions, tenant dashboard with room/rent/payment status/complaints/announcements panels, all portal modules reachable through navigation, verifyPhase10 script)

Dev accounts (local only):

- Admin: admin@hostel.test / Admin@12345
- Tenant: tenant1@hostel.test / Passw0rd123

Load the local demo data (3 properties, 8 tenants, 12 payments, 8 complaints,
4 announcements, tenant documents) so both dashboards have something to show:

    cd backend
    npm run seed:demo

Create/promote an admin: `npm run seed:admin -- <email> <password> [name]`

## Supabase document storage (Phase 9)

Tenant documents are stored in Supabase storage; the database keeps only the
metadata and the public URL. The bucket has to exist before the tenant
document page works.

1. Create the bucket — run `supabase/storage-setup.sql` once in Supabase →
   SQL Editor, or create it by hand in Storage → Buckets with these settings:

   | Setting             | Value                                                  |
   | ------------------- | ------------------------------------------------------ |
   | Name                | `tenant-documents`                                     |
   | Public bucket       | **ON** (URLs are persisted permanently)                |
   | File size limit     | `5242880` (5 MB)                                       |
   | Allowed MIME types  | `image/png, image/jpeg, image/webp, application/pdf`   |

2. Fill in both environment files, then restart both dev processes:

   ```
   cp backend/.env.example backend/.env      # if not already present
   cp frontend/.env.example frontend/.env    # if not already present
   ```

   `frontend/.env` (Project Settings → API; use the **publishable** key, never
   `service_role`):

   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<sb_publishable_… or eyJ… anon key>
   VITE_SUPABASE_DOCS_BUCKET=tenant-documents
   ```

   `backend/.env` — public values only, used by `seed:demo` and
   `verify:phase9` so stored document URLs point at the real bucket:

   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_DOCS_BUCKET=tenant-documents
   ```

   Vite reads `.env` only at startup, so `npm run dev` must be restarted after
   editing it.

Notes:

- Tenant isolation is enforced by the backend, which scopes every document
  operation to the caller's own tenant record. The Supabase client is
  storage-only and never signs in, so `auth.uid()` is always null — do not add
  an RLS policy keyed on it, it would reject every upload.
- The bucket is public by design. Anyone holding a document URL can read that
  file, so treat stored documents as sensitive and do not paste their URLs
  into shared channels.

## Quick Start (root scripts)

    npm install          # installs root dev tools (concurrently)
    npm run install:all  # installs backend and frontend dependencies
    npm run dev          # starts backend and frontend together

Output is prefixed with [backend] / [frontend]. Individual apps:

    npm run dev:backend
    npm run dev:frontend

Other root scripts: `npm run build`, `npm run typecheck`, `npm run lint`.

## Backend (Express 5 + Apollo Server 5 + TypeORM + PostgreSQL)

    cd backend
    npm install
    npm run build
    npm run start

Migrations:

    npm run migration:generate -- src/migrations/<MigrationName>
    npm run migration:run
    npm run migration:revert

Verification scripts (each exercises the real GraphQL layer and cleans up):

    npm run verify:entities   # Phase 2  — entities, relations, write invariants
    npm run verify:phase4     # Phase 4  — PG and room management
    npm run verify:phase5     # Phase 5  — tenant management and assignment
    npm run verify:phase6     # Phase 6  — rent and payment management
    npm run verify:phase7     # Phase 7  — complaint management
    npm run verify:phase8     # Phase 8  — announcement management
    npm run verify:phase9     # Phase 9  — tenant documents
    npm run verify:phase10    # Phase 10 — admin dashboard statistics

## Frontend (React 19 + Vite + Apollo Client + MUI)

    cd frontend
    npm install
    npm run dev

The MUI theme in `frontend/src/theme.ts` implements the MRD UI/UX Design System
palette — all UI must use it consistently.

Dashboard charts use MUI X Charts (`@mui/x-charts`), as the MRD requires, and
take every color from the theme palette so no module introduces its own.
