Hostel Management System

Market Requirements Document (MRD)

Development-oriented specification for implementing the application using OpenCode.

# 1. Project Overview

The Hostel Management System is a web application for managing PG/hostel properties, rooms, tenants, rent payments, complaints, announcements, tenant documents, and administrative dashboards.

The system has two primary user roles: Admin and Tenant. Admin users manage hostel/PG operations, while Tenant users access their room, payment, complaint, announcement, and document information.

The application uses a React and TypeScript frontend, a Node.js and TypeScript backend, GraphQL for application APIs, TypeORM for database access, and PostgreSQL as the database.

# 2. Project Objectives

Provide centralized management of PGs, rooms, and tenants.

Manage tenant allocation and room occupancy.

Record and manage tenant rent payments.

Allow tenants to submit and track complaints.

Allow administrators to create and manage announcements.

Manage tenant documents and document URLs.

Provide separate Admin and Tenant dashboards.

Provide authentication, authorization, profile management, and protected routes.

Maintain a clear backend service structure and feature-oriented frontend structure.

# 3. User Roles

## 3.1 Admin

Login and access protected administration features.

Manage PG properties.

Manage rooms and room occupancy.

Create and manage tenants.

Manage rent payments.

Manage complaints.

Create and manage announcements.

View administrative dashboard information.

Manage tenant-related operational information.

## 3.2 Tenant

Register and login.

View profile information.

View assigned PG and room.

View rent payment information and history.

Create and view complaints.

View PG announcements.

Upload and manage tenant documents.

View tenant dashboard information.

# 4. Main Modules

Authentication and Profile

PG Management

Room Management

Tenant Management

Rent Payment Management

Complaint Management

Announcement Management

Tenant Document Management

Admin Dashboard

Tenant Dashboard

# 5. Functional Requirements

FR-01: The system shall allow users to register.

FR-02: The system shall allow users to login using authenticated credentials.

FR-03: The system shall support logout and token refresh.

FR-04: The system shall allow authenticated users to view and update profile information.

FR-05: The system shall protect application routes based on authentication and role.

FR-06: The system shall allow administrators to create PG records.

FR-07: The system shall allow administrators to update PG records.

FR-08: The system shall allow administrators to view PG records.

FR-09: The system shall allow administrators to create rooms.

FR-10: The system shall allow administrators to update room information.

FR-11: The system shall maintain room occupancy information.

FR-12: The system shall support room search and paginated room retrieval where applicable.

FR-13: The system shall allow administrators to create tenants.

FR-14: The system shall allow administrators to update tenant information.

FR-15: The system shall validate tenant, PG, and room relationships during tenant creation or update.

FR-16: The system shall update room occupancy when a tenant is assigned or reassigned.

FR-17: The system shall allow tenants to view their assigned PG and room.

FR-18: The system shall allow administrators to create rent payment records.

FR-19: The system shall allow administrators to update rent payment records.

FR-20: The system shall provide tenant rent payment history.

FR-21: The system shall provide administrative payment summaries and history.

FR-22: The system shall allow tenants to create complaints.

FR-23: The system shall allow users to view complaint records permitted for their role.

FR-24: The system shall allow administrators to update complaint records.

FR-25: The system shall allow administrators to create announcements for a PG.

FR-26: The system shall allow administrators to update announcements.

FR-27: The system shall allow tenants to view announcements applicable to their PG.

FR-28: The system shall allow tenants to view their documents.

FR-29: The system shall allow tenant document upload and update operations.

FR-30: The system shall allow tenant document deletion.

FR-31: The system shall provide an admin dashboard with operational statistics.

FR-32: The system shall provide a tenant dashboard.

FR-33: The system shall prevent unauthorized users from accessing protected operations.

FR-34: The system shall avoid exposing password values through application responses.

FR-35: The system shall use database transactions for tenant and room state changes that must remain consistent.

FR-36: The system shall use database migrations for schema changes.

# 6. System Architecture

## 6.1 Frontend

React 19 with TypeScript.

Vite for development and build tooling.

Apollo Client for GraphQL communication.

React Router for application routing.

Material UI and MUI X Charts for interface components and dashboard visualizations.

React Hook Form and Zod for form handling and validation.

Supabase client for document storage integration.

## 6.2 Backend

Node.js with TypeScript.

Express 5 application server.

Apollo Server 5 for GraphQL.

TypeORM for database access.

PostgreSQL database.

JWT-based authentication with password hashing.

HTTP-only cookie-based authentication handling.

Service layer for business logic.

TypeORM migrations for database schema management.

# 7. Folder Structure

## 7.1 Root

Hostel_Management_System-main/
├── backend/
├── frontend/
└── README.md

## 7.2 Backend

backend/
├── package.json
├── package-lock.json
├── tsconfig.json
└── src/
    ├── app.ts
    ├── server.ts
    ├── types.ts
    ├── authUtility/
    │   └── authmiddleware.ts
    ├── config/
    │   └── db.ts
    ├── entities/
    │   ├── user.entity.ts
    │   ├── pg.entity.ts
    │   ├── room.entity.ts
    │   ├── tenant.entity.ts
    │   ├── tenant_docs.entity.ts
    │   ├── rent_payment.entity.ts
    │   ├── complaint.entity.ts
    │   └── announcement.entity.ts
    ├── graphql/
    │   ├── resolvers.ts
    │   ├── typeDefs.ts
    │   ├── services/
    │   └── types/
    ├── migrations/
    └── utils/
        ├── jwt.ts
        └── password.ts

## 7.3 Frontend

frontend/
├── package.json
├── vite.config.ts
├── eslint.config.js
├── tsconfig.json
├── index.html
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── index.css
    ├── assets/
    ├── components/
    ├── context/
    ├── graphql/
    ├── pages/
    │   ├── auth/
    │   ├── admin/
    │   └── tenants/
    ├── routes/
    ├── supabase/
    ├── types/
    └── utils/

# 8. Database Entities

User — application user and authentication information.

Pg — PG/hostel property information.

Room — room information and occupancy.

Tenant — tenant information and PG/room assignment.

TenantDocument — tenant document metadata and stored document URL.

RentPayment — tenant rent/payment records.

Complaint — tenant complaint records associated with PG/tenant.

Announcement — PG announcements created by users.

# 9. Entity Relationships

User 1 ───── 0..1 Tenant
Tenant * ───── 1 Pg
Tenant * ───── 0..1 Room
Pg 1 ───── * Room
Tenant 1 ───── * TenantDocument
Tenant 1 ───── * RentPayment
Tenant 1 ───── * Complaint
Pg 1 ───── * Complaint
Pg 1 ───── * Announcement
User 1 ───── * Announcement

# 10. GraphQL API Requirements

## 10.1 Authentication and Profile

me

allUsers

registerUser

loginUser

logoutUser

refreshToken

updateProfile

## 10.2 PG Management

getAllPgsRooms

getAllPgs

getTenantPgRoom

createPg

updatePg

## 10.3 Room Management

getAllRooms

createRoom

updateRoom

## 10.4 Tenant Management

getAllTenants

createTenant

updateTenant

## 10.5 Tenant Documents

getTenantDocuments

uploadTenantDocs

updateTenantDocs

deleteTenantDocuments

## 10.6 Payments

getAllRentPayments

getAdminRentSummary

getRentPaymentHistory

createRentPayment

updateRentPayment

getAdminRentHistory

## 10.7 Complaints

getTenantComplaints

getAllComplaints

createComplaint

updateComplaint

## 10.8 Announcements

getTenantPgAnnouncements

getAllAnnouncements

createAnnouncement

updateAnnouncement

## 10.9 Dashboard

getAdminDashboardStats

# 11. UI Pages and Routes

## 11.1 Authentication

/login

/register

/profile

## 11.2 Admin

/admin/dashboard

/admin/pg

/admin/rooms

/admin/tenants

/admin/payments

/admin/complaints

/admin/announcements

## 11.3 Tenant

/tenant/dashboard

/tenant/room

/tenant/payments

/tenant/complaints

/tenant/announcements

/tenant/documents

## UI/UX Design System

### 1. Overall Design
- Modern, clean, professional hostel management dashboard
- Responsive design for desktop, tablet, and mobile
- Use Material UI components
- Consistent spacing, typography, buttons, forms, tables, cards, and dialogs

### 2. Color Palette

Primary Color:
- Primary: #1976D2
- Used for primary buttons, links, active navigation, and important actions

Secondary Color:
- Secondary: #9C27B0

Success:
- #2E7D32

Warning:
- #ED6C02

Error:
- #D32F2F

Background:
- Main background: #F5F7FA
- Card background: #FFFFFF

Text:
- Primary text: #1F2937
- Secondary text: #6B7280

### 3. Typography
- Use Material UI default typography
- Page heading: large and bold
- Section heading: medium and semi-bold
- Body text: regular
- Table text: standard readable size

### 4. Admin Layout

The Admin portal should contain:

- Left sidebar navigation
- Top header/navbar
- Main content area
- Responsive sidebar for smaller screens

Sidebar menu:
- Dashboard
- PG Management
- Room Management
- Tenant Management
- Payments
- Complaints
- Announcements

### 5. Tenant Layout

The Tenant portal should contain:

- Top navigation/header
- Dashboard
- Profile access
- Main content area

Tenant menu:
- Dashboard
- My Room
- Payments
- Complaints
- Announcements
- Documents

### 6. Dashboard UI

Dashboard should use:
- Summary cards
- Tables
- Charts
- Recent activity sections

Admin dashboard cards:
- Total PGs
- Total Rooms
- Occupied Rooms
- Total Tenants
- Pending Payments
- Open Complaints

Tenant dashboard cards:
- Current Room
- Current Rent
- Payment Status
- Open Complaints

### 7. Tables

All management tables should support:
- Pagination
- Search
- Sorting where required
- Loading state
- Empty state
- Error state
- Action buttons

### 8. Forms

Forms should:
- Use React Hook Form + Zod validation
- Show validation messages
- Clearly indicate required fields
- Disable submit while submitting
- Show success/error feedback

### 9. Status Display

Use consistent status indicators.

Examples:

Payment:
- Pending
- Partial
- Paid
- Overdue

Complaint:
- Open
- In Progress
- Resolved

Use chips/badges for statuses.

### 10. Responsive Design

The application should work properly on:
- Desktop
- Tablet
- Mobile

The Admin sidebar should collapse on smaller screens.

### 11. UI States

Every data-driven page should handle:
- Loading
- Success
- Empty
- Error

### 12. Accessibility

- Buttons and form fields should have clear labels
- Sufficient color contrast
- Keyboard-accessible interactive elements
- Meaningful error messages

# 12. Feature-wise Implementation Details

## 12.1 Authentication

Implement registration and login.

Hash passwords before persistence.

Generate and validate authentication tokens.

Use protected GraphQL context for authenticated operations.

Implement logout and token refresh.

Implement frontend authentication context and protected routes.

## 12.2 PG and Room Management

Create and update PG records.

Create and update rooms.

Associate rooms with PGs.

Maintain occupancy information.

Provide room listing, search, and pagination where applicable.

## 12.3 Tenant Management

Create and update tenants.

Validate user and PG/room relationships.

Assign tenants to rooms.

Update room occupancy during assignment/reassignment.

Use a transaction for related tenant and room changes.

## 12.4 Rent Payments

Create and update payment records.

Display tenant payment history.

Display admin payment summaries and history.

Keep payment status handling consistent between database and GraphQL types.

## 12.5 Complaints

Allow tenants to submit complaints.

Allow users to retrieve permitted complaints.

Allow administrators to update complaint records.

## 12.6 Announcements

Allow administrators to create and update PG announcements.

Allow tenants to retrieve announcements belonging to their PG.

## 12.7 Documents

Allow tenants to upload documents.

Store document files in Supabase storage.

Store document URLs and metadata in the application database.

Support update and deletion operations.

## 12.8 Dashboards

Provide administrative operational statistics.

Provide tenant-specific dashboard information.

Use MUI X Charts where charts are required.

# 13. Phase-wise Development Plan

## Phase 1 — Project Foundation

Implementation:

Set up backend and frontend projects.

Configure TypeScript, Vite, Express, Apollo Server, TypeORM, and PostgreSQL.

Configure environment variables.

Configure database connection.

Configure frontend Apollo Client and routing.

Acceptance Criteria:

Backend starts successfully.

Frontend starts successfully.

Database connection can be established.

Frontend can communicate with GraphQL backend.

## Phase 2 — Database and Core Entities

Implementation:

Implement User, Pg, Room, Tenant, TenantDocument, RentPayment, Complaint, and Announcement entities.

Configure entity relationships.

Create and run TypeORM migrations.

Configure GraphQL base types.

Acceptance Criteria:

All required tables can be created through migrations.

Entity relationships work correctly.

Application can read and write core entities.

## Phase 3 — Authentication and Profile

Implementation:

Implement registration.

Implement login/logout.

Implement token refresh.

Implement current-user query.

Implement profile update.

Implement frontend authentication context and protected routes.

Acceptance Criteria:

Users can register and login.

Authenticated requests identify the current user.

Admin and Tenant routes are protected.

Logout and refresh behavior works.

## Phase 4 — PG and Room Management

Implementation:

Implement PG CRUD operations.

Implement room CRUD operations.

Implement room listing, search, and pagination.

Implement occupancy tracking.

Acceptance Criteria:

Admin can manage PGs and rooms.

Rooms are linked to PGs.

Occupancy values remain consistent.

## Phase 5 — Tenant Management

Implementation:

Implement tenant CRUD operations.

Implement PG and room assignment.

Implement room reassignment.

Implement tenant listing and pagination where applicable.

Use transactions for tenant/room state changes.

Acceptance Criteria:

Admin can create and update tenants.

Tenant assignments are validated.

Room occupancy updates correctly after assignment and reassignment.

## Phase 6 — Rent and Payment Management

Implementation:

Implement payment creation and update.

Implement tenant payment history.

Implement admin payment summary and history.

Implement payment UI.

Acceptance Criteria:

Payment records can be created and updated.

Tenant history is visible.

Admin summary/history is available.

Payment status values are consistent.

## Phase 7 — Complaint Management

Implementation:

Implement complaint creation.

Implement complaint retrieval.

Implement complaint update.

Implement admin and tenant complaint pages.

Acceptance Criteria:

Tenant can create complaints.

Authorized users can view complaints.

Admin can update complaint records.

## Phase 8 — Announcement Management

Implementation:

Implement announcement creation and update.

Implement PG-specific announcement retrieval.

Implement admin and tenant announcement pages.

Acceptance Criteria:

Admin can manage announcements.

Tenant can see announcements for the relevant PG.

## Phase 9 — Tenant Documents and Storage

Implementation:

Configure Supabase storage.

Implement document upload.

Persist document URL and metadata.

Implement document update and delete.

Implement tenant document UI.

Acceptance Criteria:

Tenant can upload documents.

Uploaded document URLs are persisted.

Documents can be updated and deleted.

## Phase 10 — Dashboards and UX Completion

Implementation:

Implement admin dashboard statistics.

Implement tenant dashboard.

Complete navigation, layouts, loading states, error states, forms, tables, and charts.

Ensure responsive behavior.

Acceptance Criteria:

Both dashboards display relevant information.

All implemented modules are reachable through navigation.

Major loading/error/empty states are handled.

## Phase 11 — Testing, Hardening and Delivery

### Objective

Perform a complete end-to-end verification of the Hostel Management System before delivery.

The system must be tested feature-by-feature for both Admin and Tenant users. Do not consider the phase complete only because the application builds, starts, or passes basic type checks.

Testing must verify the complete flow:

UI → GraphQL/API → Business Logic → Database → Response → UI

---

### 11.1 Build and Static Validation

#### Backend

* Run TypeScript type-checking.
* Run backend build.
* Run backend linting.
* Verify there are no compilation errors.
* Verify there are no unresolved imports.
* Verify all required environment variables are configured.
* Verify database connection starts successfully.

#### Frontend

* Run frontend type-checking.
* Run frontend build.
* Run frontend linting.
* Verify there are no compilation errors.
* Verify there are no unresolved imports.
* Verify production build succeeds.

---

### 11.2 Database and Migration Validation

* Verify database connection.
* Verify all migrations execute successfully.
* Verify migration rollback where applicable.
* Verify all required tables are created.
* Verify primary keys and foreign keys.
* Verify unique constraints.
* Verify nullable/non-nullable fields.
* Verify cascade/restrict relationships.
* Verify indexes where defined.
* Verify seed/default data where applicable.
* Verify no migration creates duplicate or inconsistent schema.
* Verify application can start successfully against the migrated database.

---

### 11.3 Authentication and Authorization Testing

Test authentication for both Admin and Tenant.

#### Admin

* Admin login succeeds with valid credentials.
* Admin login fails with invalid credentials.
* Authentication state is maintained correctly.
* Logout works.
* Protected Admin routes cannot be accessed without authentication.
* Tenant cannot access Admin-only routes.
* Admin-only GraphQL operations reject unauthorized users.

#### Tenant

* Tenant login succeeds with valid credentials.
* Tenant login fails with invalid credentials.
* Authentication state is maintained correctly.
* Logout works.
* Protected Tenant routes cannot be accessed without authentication.
* Tenant cannot access Admin-only routes.
* Tenant cannot perform Admin-only GraphQL operations.

#### Security

* Verify unauthorized requests return the correct error.
* Verify expired/invalid tokens are rejected.
* Verify role checks are enforced on the backend, not only in the frontend.
* Verify users cannot access another user's protected data by changing IDs or request parameters.

---

### 11.4 Admin Feature-by-Feature Testing

Test every Admin feature defined in the MRD.

For each feature, verify:

1. Page loads successfully.
2. Data loads correctly.
3. Create operation works.
4. Read/list operation works.
5. Update operation works.
6. Delete operation works where applicable.
7. Search works.
8. Filtering works where applicable.
9. Sorting works where applicable.
10. Pagination works.
11. Form validation works.
12. Required fields are enforced.
13. Invalid data is rejected.
14. Success messages are displayed correctly.
15. Error messages are displayed correctly.
16. Loading states work correctly.
17. Empty states work correctly.
18. Confirmation dialogs work where applicable.
19. Refreshing the page does not corrupt application state.
20. Database data matches the UI after each operation.

#### Admin modules to verify

* Admin Authentication
* Admin Dashboard
* User Management
* PG/Hostel Management
* Room Management
* Tenant Management
* Tenant/Room Assignment
* Payment/Rent Management
* Complaint Management
* Announcement Management
* Document Management
* Reporting/Analytics
* Any additional Admin features defined in the MRD

Do not mark an Admin module as passed merely because its page opens. Verify the complete functionality of every available operation.

---

### 11.5 Tenant Feature-by-Feature Testing

Test every Tenant feature defined in the MRD.

For each feature, verify:

1. Page loads successfully.
2. Correct tenant-specific data is displayed.
3. Create operation works where applicable.
4. Read/list operation works.
5. Update operation works where applicable.
6. Delete/cancel operation works where applicable.
7. Search/filter functionality works where applicable.
8. Form validation works.
9. Required fields are enforced.
10. Invalid data is rejected.
11. Success messages are displayed correctly.
12. Error messages are displayed correctly.
13. Loading states work correctly.
14. Empty states work correctly.
15. Tenant can access only their own permitted data.
16. Tenant cannot access another tenant's data.
17. Database changes are reflected correctly in the UI.
18. Refreshing the page preserves correct application state.

#### Tenant modules to verify

* Tenant Authentication
* Tenant Dashboard
* Profile Management
* PG/Hostel Information
* Room Information
* Room/Tenant Assignment information
* Rent/Payment Management
* Payment History
* Complaints
* Announcements
* Documents
* Any additional Tenant features defined in the MRD

Do not mark a Tenant module as passed merely because its page opens. Verify the complete functionality of every available operation.

---

### 11.6 Role and Data Isolation Testing

Verify that Admin and Tenant permissions are correctly isolated.

Test scenarios such as:

* Admin accessing Admin features.
* Admin accessing permitted Tenant-related data.
* Tenant accessing Tenant features.
* Tenant attempting to access Admin features.
* Tenant attempting to access another Tenant's data.
* Unauthenticated user attempting to access protected pages.
* Direct URL access to protected pages.
* Direct GraphQL/API requests bypassing the frontend.
* Manipulating IDs in requests to access another user's records.

Expected result:

Authorization must be enforced at the backend/API level and must not depend only on frontend route protection.

---

### 11.7 CRUD and Data Integrity Testing

For every entity/module that supports CRUD operations:

#### Create

* Valid data creates successfully.
* Invalid data is rejected.
* Required fields are validated.
* Duplicate data is handled correctly.

#### Read

* Correct records are returned.
* Related records are returned correctly.
* Users receive only authorized records.

#### Update

* Valid updates succeed.
* Invalid updates are rejected.
* Relationships remain consistent after updates.

#### Delete

* Valid deletion succeeds where permitted.
* Unauthorized deletion is rejected.
* Cascade/restrict behavior works as designed.
* Deleted records are no longer incorrectly displayed.

---

### 11.8 Critical Business Flow Testing

Test complete real-world workflows instead of testing individual pages only.

#### Admin flows

* Admin login → Dashboard → Manage PG → Manage Rooms → Manage Tenants.
* Admin creates tenant → assigns room → verifies tenant data.
* Admin records/updates payment → verifies payment history.
* Admin creates announcement → verifies tenant visibility.
* Admin receives/manages complaint → updates status → verifies tenant view.
* Admin manages tenant documents → verifies correct tenant association.

#### Tenant flows

* Tenant login → Dashboard → Profile.
* Tenant views PG/room information.
* Tenant views payment information/history.
* Tenant submits complaint → Admin manages complaint → Tenant sees updated status.
* Tenant views announcements.
* Tenant views/downloads permitted documents.

Every critical flow must be tested from the beginning to the final expected result.

---

### 11.9 Tenant–Room Transaction Testing

Test all critical tenant-room scenarios.

* Assign tenant to an available room.
* Prevent assignment to an unavailable/full room.
* Move tenant from one room to another.
* Verify previous room occupancy is updated.
* Verify new room occupancy is updated.
* Prevent invalid room assignment.
* Verify tenant-room relationship remains consistent after update.
* Test concurrent/transaction-sensitive room assignment scenarios.
* Verify rollback when part of the transaction fails.
* Verify database state after successful and failed transactions.

---

### 11.10 GraphQL/API Testing

Verify every implemented GraphQL operation.

For each Query:

* Valid request succeeds.
* Unauthorized request fails.
* Invalid parameters fail correctly.
* Correct data is returned.
* Pagination/filtering/sorting works where applicable.

For each Mutation:

* Valid mutation succeeds.
* Invalid input is rejected.
* Authorization is enforced.
* Database changes are correct.
* Returned data matches the database state.

Also verify:

* GraphQL schema is valid.
* Resolver errors are handled correctly.
* Validation errors are meaningful.
* No sensitive information is exposed in errors.
* No unauthorized data is returned.

---

### 11.11 UI/UX Validation

For every Admin and Tenant page verify:

* Page loads without console errors.
* Navigation works.
* Buttons perform the correct action.
* Forms work correctly.
* Validation messages are visible and understandable.
* Loading indicators appear when required.
* Empty states are handled.
* Error states are handled.
* Success feedback is displayed.
* Tables render correctly.
* Pagination works.
* Dialogs/modals work.
* Back/forward navigation behaves correctly.
* Responsive layout works for supported screen sizes.
* No broken links/routes exist.

---

### 11.12 Error and Edge-Case Testing

Test:

* Empty database.
* No tenants.
* No rooms.
* No payments.
* No complaints.
* Invalid IDs.
* Duplicate records.
* Missing required fields.
* Invalid formats.
* Unauthorized requests.
* Expired authentication.
* Network/API failure.
* Database failure.
* Failed transactions.
* Large datasets where applicable.
* Boundary values.
* Refreshing pages during authenticated sessions.

The application must fail gracefully without corrupting data.

---

### 11.13 Regression Testing

After fixing any defect:

1. Reproduce the original issue.
2. Apply the fix.
3. Verify the issue is resolved.
4. Re-run the affected feature.
5. Re-run related features.
6. Re-run critical Admin flows.
7. Re-run critical Tenant flows.
8. Run the complete type-check/build/test suite.

Do not introduce a fix that breaks another module.

---

### 11.14 Production Readiness

Before delivery verify:

* Backend starts successfully.
* Frontend production build succeeds.
* All required environment variables are documented.
* No secrets/API keys are committed.
* No development-only configuration is accidentally used in production.
* Database migrations are production-safe.
* CORS configuration is correct.
* Authentication configuration is correct.
* Error handling is production-safe.
* Logging does not expose sensitive information.
* No debug/test code remains.
* No unnecessary console logs remain.
* No TODOs/blockers remain in critical functionality.
* No broken routes or GraphQL operations remain.

---

### 11.15 Final Acceptance Checklist

The phase is complete only when all of the following are true:

* [ ] Backend type-check passes.
* [ ] Backend build passes.
* [ ] Backend lint passes.
* [ ] Frontend type-check passes.
* [ ] Frontend build passes.
* [ ] Frontend lint passes.
* [ ] Database migrations pass.
* [ ] Authentication works.
* [ ] Authorization works.
* [ ] Admin authentication tested.
* [ ] Tenant authentication tested.
* [ ] Every Admin feature tested.
* [ ] Every Tenant feature tested.
* [ ] Every implemented CRUD operation tested.
* [ ] Every implemented GraphQL Query tested.
* [ ] Every implemented GraphQL Mutation tested.
* [ ] Role isolation tested.
* [ ] Tenant data isolation tested.
* [ ] Tenant-room transactions tested.
* [ ] Critical Admin end-to-end flows tested.
* [ ] Critical Tenant end-to-end flows tested.
* [ ] Error and edge cases tested.
* [ ] Regression testing completed.
* [ ] Production configuration reviewed.
* [ ] No critical defects remain.
* [ ] Application is ready for delivery.

### Final Rule

Do not mark Phase 11 as complete based only on automated build/type-check/lint results.

A feature is considered verified only when its UI, API/GraphQL operation, business logic, database behavior, authorization, validation, error handling, and end-to-end user flow have been tested where applicable.


# 14. OpenCode Development Guidelines

Read the existing implementation before modifying files.

Implement one phase at a time and complete its acceptance criteria before moving to the next phase.

Keep business logic inside backend service files instead of placing business rules directly in GraphQL resolvers.

Keep GraphQL operation names and field names consistent across frontend and backend.

Reuse existing entities, services, types, routes, and components where appropriate.

Do not expose password fields through GraphQL responses.

Use environment variables for database, authentication, and external service configuration.

Use database transactions whenever multiple related records must change together.

Preserve the Admin and Tenant role boundaries.

Use TypeORM migrations for database schema changes.

After each phase, run type checking, linting/build checks where available, and verify the affected feature.

# 15. Non-Functional Requirements

The application shall be implemented using TypeScript.

The backend shall expose application operations through GraphQL.

Database access shall use TypeORM.

PostgreSQL shall be used as the relational database.

Authentication data shall be protected using secure password hashing and token handling.

Protected operations shall enforce authorization.

Database schema changes shall be managed using migrations.

The frontend shall provide clear loading, error, empty, and success states.

The application should support maintainable feature-oriented code organization.

Critical multi-record updates shall maintain database consistency.

# 16. Important Implementation Notes

The RentPayment entity contains payment status values including pending, partial, paid, and overdue, while the GraphQL PaymentStatus definition should be kept consistent with the intended application behavior.

TypeORM synchronization is disabled, so schema changes must be handled through migrations.

Tenant room assignment and reassignment must preserve room occupancy consistency.

Tenant documents use storage for the actual file and the database for document metadata/URL.

Role protection should be applied at both frontend routing and backend authorization levels.

Collection operations should use consistent pagination behavior where large datasets are expected.

Package compatibility should be verified before changing dependency versions.

# 17. Local Development Commands

## 17.1 Backend

cd backend
npm install
npm run start

## 17.2 Database Migrations

npm run migration:generate -- src/migrations/<MigrationName>
npm run migration:run
npm run migration:revert

## 17.3 Frontend

cd frontend
npm install
npm run dev

## 17.4 Frontend Validation

npm run build
npm run lint

# 18. Definition of Done

The requested feature is implemented in the appropriate frontend and backend layers.

GraphQL types, queries, mutations, and frontend operations are aligned.

Authorization is applied correctly.

Database changes are represented through migrations.

Validation and error handling are implemented.

Loading, empty, and error states are handled in the UI.

Type checking and lint/build checks pass.

The feature is verified through its documented acceptance criteria.