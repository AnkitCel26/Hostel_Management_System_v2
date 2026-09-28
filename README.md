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

Dev accounts (local only):

- Admin: admin@hostel.test / Admin@12345
- Tenant: tenant1@hostel.test / Passw0rd123

Create/promote an admin: `npm run seed:admin -- <email> <password> [name]`

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

Phase 2 entity read/write verification:

    npm run verify:entities

## Frontend (React 19 + Vite + Apollo Client + MUI)

    cd frontend
    npm install
    npm run dev

The MUI theme in `frontend/src/theme.ts` implements the MRD UI/UX Design System
palette — all UI must use it consistently.
