# Hostel Management System

## Project Instructions

Build this project from scratch according to:

MRD/Hostel_Management_System_MRD.md

## Architecture

The application should contain:

- React + TypeScript frontend
- Node.js + TypeScript backend
- Express
- GraphQL
- Apollo Server
- TypeORM
- PostgreSQL

## Development Rules

1. Build the project from scratch.
2. Follow the MRD phase by phase.
3. Do not skip phases.
4. Do not implement future phases unless requested.
5. Read the relevant MRD section before implementation.
6. Keep backend business logic inside service layers.
7. Keep GraphQL resolvers focused on API operations.
8. Use TypeORM entities and migrations for database changes.
9. Use transactions when multiple related records must change together.
10. Keep Admin and Tenant authorization separate.
11. Do not expose passwords through GraphQL.
12. Use environment variables for secrets and configuration.
13. Keep frontend and backend GraphQL types consistent.
14. Use reusable components where appropriate.
15. Do not unnecessarily add technologies that are not required by the MRD.

## Validation

After each phase:

- Run TypeScript checks.
- Run linting.
- Run builds where applicable.
- Check the implemented functionality.
- Verify the phase acceptance criteria.

Do not automatically continue to the next phase.

## UI/UX Rules

1. Follow the UI/UX Design System defined in:
   MRD/Hostel_Management_System_MRD.md

2. Use Material UI consistently across the application.

3. Do not introduce a different color palette or visual style for individual modules.

4. Reuse existing UI components where appropriate.

5. Maintain consistent layouts, typography, spacing, forms, tables, cards, buttons, and status indicators.

6. Every data-driven page must handle loading, success, empty, and error states.

7. Maintain responsive and accessible UI across Admin and Tenant portals.

8. Do not change the defined UI/UX design system unless explicitly requested.

## Frontend Conventions

1. Global chrome (skip link, sticky header, main landmark, footer) lives in
   `src/components/AppShell.tsx` via `AppHeader` / `AppFooter`. `AppShell` is
   route-aware: portal routes (`/admin/*`, `/tenant/*`, `/profile`) render
   inside the post-login `PortalShell` (sidebar navigation + portal top bar,
   in `src/components/portal/`), while public pages keep the marketing
   header/footer. Pages render inside it and must not render their own
   app-level header/footer.

2. Typography uses Inter (loaded in `index.html`), set once in `src/theme.ts`.
   This was an explicitly approved deviation from the MRD's "Material UI
   default typography" wording. The MRD color palette remains unchanged.

3. Shared UI components in `src/components/`: `AppShell`, `AppHeader`,
   `AppFooter`, `SystemStatus` (live backend health indicator),
   `FeatureCard`, `AuthLayout` (split-screen shell for auth pages),
   `ProductPreview` (decorative mini-dashboard visual),
   `LoadingIndicator`, `ErrorAlert`, `PageHeader` (page heading + action
   slot), `EmptyState`, `OccupancyChip` (room occupancy status),
   `StatCard` (summary statistic tile with tinted icon badge),
   `PaymentStatusChip` (rent payment status).
   Reuse these before creating new ones. Portal chrome lives in
   `src/components/portal/`: `PortalShell` (sidebar + top bar layout for
   post-login routes) and `portalNav` (per-role navigation config).
   Admin-specific dialogs live in `src/components/admin/`:
   `PgFormDialog`, `RoomFormDialog`, `TenantFormDialog`, `PaymentFormDialog`.

4. GraphQL operations live in `src/graphql/operations.ts` — do not inline
   `gql` documents in pages/components.

5. Global mutation feedback lives in `src/context/SnackbarContext.tsx`
   (`useSnackbar()`). After any create/update succeeds, call
   `success(message)` — the toast auto-hides after ~3.5s. Do not add
   per-page `Snackbar` components; keep field/form errors inline.

6. User-facing copy says "Property"/"Properties" for the PG domain —
   users never see "PG" in the UI. The API/domain layer keeps the MRD
   name (`Pg`, `pgId`, `createPg`, …) unchanged. Read display terms from
   `src/utils/labels.ts` (`PROPERTY_TERM`). This was an explicitly
   approved product decision; the admin properties route is
   `/admin/properties` (`/admin/pg` redirects to it).