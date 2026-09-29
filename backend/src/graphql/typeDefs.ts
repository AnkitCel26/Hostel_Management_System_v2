// GraphQL schema: Phase 2 base types + Phase 3 authentication operations +
// Phase 4 PG/room management operations + Phase 5 tenant management operations +
// Phase 6 rent and payment management operations + Phase 7 complaint management operations +
// Phase 8 announcement management operations.
// Password is intentionally never exposed (FR-34).
export const typeDefs = `
  type Query {
    health: String!

    "Current authenticated user (null when not logged in)."
    me: User

    "All users. Admin-only."
    allUsers: [User!]!

    "All PGs with their rooms (PGs newest first, rooms by room number). Admin-only."
    getAllPgsRooms: [Pg!]!

    "All PGs, newest first. Admin-only."
    getAllPgs: [Pg!]!

    "The current tenant's assigned PG and room. Tenant-only; null while the user has no tenant record."
    getTenantPgRoom: TenantPgRoom

    "Searchable, paginated room list (search matches room number and room type). Admin-only."
    getAllRooms(search: String, pgId: ID, limit: Int = 20, offset: Int = 0): RoomPage!

    "All tenants, newest first (search matches tenant name, phone, and the linked user's email). Admin-only."
    getAllTenants(search: String, pgId: ID, limit: Int = 20, offset: Int = 0): TenantPage!

    "Searchable, paginated rent payment list (search matches the tenant name, the linked user's email, the tenant's room number, and the payment notes; the status filter matches the live status). Admin-only."
    getAllRentPayments(search: String, pgId: ID, tenantId: ID, status: PaymentStatus, limit: Int = 20, offset: Int = 0): RentPaymentPage!

    "Aggregate payment statistics (counts by status, billed, collected, outstanding), optionally scoped to one PG. Admin-only."
    getAdminRentSummary(pgId: ID): RentSummary!

    "The current tenant's own payment history, newest due date first. Tenant-only."
    getRentPaymentHistory(limit: Int = 20, offset: Int = 0): RentPaymentPage!

    "Recently updated payment records (activity view). Admin-only."
    getAdminRentHistory(limit: Int = 20, offset: Int = 0): RentPaymentPage!

    "Searchable, paginated complaint list (search matches the tenant name, the linked user's email, the tenant's room number, the PG name, the complaint title, and the description). Admin-only."
    getAllComplaints(search: String, pgId: ID, tenantId: ID, status: ComplaintStatus, limit: Int = 20, offset: Int = 0): ComplaintPage!

    "The current tenant's own complaints, newest first. Tenant-only."
    getTenantComplaints(limit: Int = 20, offset: Int = 0): ComplaintPage!

    "Searchable, paginated announcement list (search matches the PG name, the announcement title, and the content). Admin-only."
    getAllAnnouncements(search: String, pgId: ID, limit: Int = 20, offset: Int = 0): AnnouncementPage!

    "Announcements of the current tenant's own PG, newest first. Tenant-only."
    getTenantPgAnnouncements(limit: Int = 20, offset: Int = 0): AnnouncementPage!
  }

  type Mutation {
    "Register a new user. Role is always Tenant and never accepted from input."
    registerUser(input: RegisterInput!): User!

    "Login with email + password. Sets HTTP-only auth cookies."
    loginUser(input: LoginInput!): User!

    "Clear auth cookies."
    logoutUser: Boolean!

    "Rotate access + refresh cookies using the refresh-token cookie."
    refreshToken: User!

    "Update the current user's profile."
    updateProfile(input: UpdateProfileInput!): User!

    "Create a PG. Admin-only."
    createPg(input: CreatePgInput!): Pg!

    "Update a PG. Omit or pass null to leave a field unchanged; send an empty string to clear an optional field. Admin-only."
    updatePg(id: ID!, input: UpdatePgInput!): Pg!

    "Create a room under a PG. Occupancy always starts at 0. Admin-only."
    createRoom(input: CreateRoomInput!): Room!

    "Update a room. Rooms cannot be moved between PGs; capacity cannot go below the current occupancy. Admin-only."
    updateRoom(id: ID!, input: UpdateRoomInput!): Room!

    "Create a tenant record linked to an existing Tenant-role user under a PG, with an optional room assignment. Room occupancy is advanced atomically. Admin-only."
    createTenant(input: CreateTenantInput!): Tenant!

    "Update a tenant. Omit or pass null to leave a field unchanged; send an empty string to clear an optional field. Room assignment changes update occupancy atomically. Admin-only."
    updateTenant(id: ID!, input: UpdateTenantInput!): Tenant!

    "Create a rent payment record for a tenant. Status is never accepted from input - it is derived from paidAmount and the due date. Admin-only."
    createRentPayment(input: CreateRentPaymentInput!): RentPayment!

    "Update a rent payment. Omit or pass null to leave a field unchanged; send an empty string to clear the notes. Status and paidDate are always re-derived. Admin-only."
    updateRentPayment(id: ID!, input: UpdateRentPaymentInput!): RentPayment!

    "Create a complaint for the current tenant. The tenant, PG, status, and resolvedAt are all system-derived — never accepted from input. Tenant-only."
    createComplaint(input: CreateComplaintInput!): Complaint!

    "Update a complaint. Omit or pass null to leave a field unchanged. resolvedAt is system-managed alongside the status. Admin-only."
    updateComplaint(id: ID!, input: UpdateComplaintInput!): Complaint!

    "Create an announcement for a PG. The creator is always the current admin - never accepted from input. Admin-only."
    createAnnouncement(input: CreateAnnouncementInput!): Announcement!

    "Update an announcement. Omit or pass null to leave a field unchanged. An announcement can never move between PGs. Admin-only."
    updateAnnouncement(id: ID!, input: UpdateAnnouncementInput!): Announcement!
  }

  input RegisterInput {
    name: String!
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input UpdateProfileInput {
    name: String
    phone: String
  }

  input CreatePgInput {
    name: String!
    address: String!
    city: String
    contactNumber: String
    description: String
  }

  input UpdatePgInput {
    name: String
    address: String
    city: String
    contactNumber: String
    description: String
  }

  input CreateRoomInput {
    "PG the room belongs to."
    pgId: ID!
    roomNumber: String!
    roomType: String
    capacity: Int!
    rent: Int!
    floor: Int
  }

  input UpdateRoomInput {
    roomNumber: String
    roomType: String
    capacity: Int
    rent: Int
    floor: Int
  }

  input CreateTenantInput {
    "Existing Tenant-role user to link. One tenant record per user."
    userId: ID!
    pgId: ID!
    "Optional room in the same PG; a free bed is verified under a row lock."
    roomId: ID
    name: String!
    phone: String
    emergencyContact: String
    "Calendar date in YYYY-MM-DD format."
    joinDate: String
  }

  input UpdateTenantInput {
    "Re-link the tenant record to another Tenant-role user; omit/null/'' keeps the current one."
    userId: ID
    name: String
    phone: String
    emergencyContact: String
    joinDate: String
    "Omit/null/'' keeps the current PG (a PG cannot be cleared)."
    pgId: ID
    "Omit to keep the room; null/'' unassigns it; an id assigns/reassigns it (the room must belong to the tenant's PG after this update)."
    roomId: ID
  }

  input CreateRentPaymentInput {
    "Existing tenant record the payment belongs to."
    tenantId: ID!
    "Total rent due (a whole number greater than zero)."
    amount: Int!
    "Amount paid so far; defaults to 0 and can never exceed amount."
    paidAmount: Int
    "Calendar date in YYYY-MM-DD format."
    dueDate: String!
    "Calendar date in YYYY-MM-DD format; only settable while the payment is fully paid, and defaults to today."
    paidDate: String
    notes: String
  }

  input UpdateRentPaymentInput {
    "Total rent due (a whole number greater than zero)."
    amount: Int
    "Amount paid so far; can never exceed amount."
    paidAmount: Int
    "Calendar date in YYYY-MM-DD format."
    dueDate: String
    "Calendar date in YYYY-MM-DD format; only settable while the payment is fully paid, and defaults to today."
    paidDate: String
    notes: String
  }

  input CreateComplaintInput {
    "Short complaint summary (1-160 characters)."
    title: String!
    "What happened and what is expected (1-5000 characters)."
    description: String!
  }

  input UpdateComplaintInput {
    "Short complaint summary (1-160 characters)."
    title: String
    "What happened and what is expected (1-5000 characters)."
    description: String
    status: ComplaintStatus
  }

  input CreateAnnouncementInput {
    "PG the announcement belongs to."
    pgId: ID!
    "Short announcement summary (1-160 characters)."
    title: String!
    "Announcement body (1-5000 characters)."
    content: String!
  }

  input UpdateAnnouncementInput {
    "Short announcement summary (1-160 characters)."
    title: String
    "Announcement body (1-5000 characters)."
    content: String
  }

  "User role used for Admin/Tenant authorization boundaries."
  enum UserRole {
    Admin
    Tenant
  }

  "Rent payment status (values match the RentPayment entity exactly, MRD §16)."
  enum PaymentStatus {
    pending
    partial
    paid
    overdue
  }

  "Complaint status (values match the Complaint entity exactly)."
  enum ComplaintStatus {
    open
    in_progress
    resolved
  }

  type User {
    id: ID!
    name: String!
    email: String!
    role: UserRole!
    phone: String
    createdAt: String!
    updatedAt: String!
    tenant: Tenant
  }

  type Pg {
    id: ID!
    name: String!
    address: String!
    city: String
    contactNumber: String
    description: String
    createdAt: String!
    updatedAt: String!
    rooms: [Room!]!
    tenants: [Tenant!]!
    complaints: [Complaint!]!
    announcements: [Announcement!]!
  }

  type Room {
    id: ID!
    roomNumber: String!
    roomType: String
    capacity: Int!
    occupiedCount: Int!
    rent: Int!
    floor: Int
    pg: Pg!
    tenants: [Tenant!]!
    createdAt: String!
    updatedAt: String!
  }

  type Tenant {
    id: ID!
    name: String!
    phone: String
    emergencyContact: String
    joinDate: String
    user: User!
    pg: Pg!
    room: Room
    documents: [TenantDocument!]!
    payments: [RentPayment!]!
    complaints: [Complaint!]!
    createdAt: String!
    updatedAt: String!
  }

  type TenantDocument {
    id: ID!
    docName: String!
    docUrl: String!
    docNumber: String
    tenant: Tenant!
    createdAt: String!
    updatedAt: String!
  }

  type RentPayment {
    id: ID!
    amount: Int!
    paidAmount: Int!
    dueDate: String!
    paidDate: String
    status: PaymentStatus!
    notes: String
    tenant: Tenant!
    createdAt: String!
    updatedAt: String!
  }

  type Complaint {
    id: ID!
    title: String!
    description: String!
    status: ComplaintStatus!
    resolvedAt: String
    tenant: Tenant!
    pg: Pg!
    createdAt: String!
    updatedAt: String!
  }

  type Announcement {
    id: ID!
    title: String!
    content: String!
    pg: Pg!
    createdBy: User!
    createdAt: String!
    updatedAt: String!
  }

  "A tenant's PG/room assignment (room is null until one is assigned)."
  type TenantPgRoom {
    pg: Pg!
    room: Room
  }

  "One page of a paginated room list. The same limit/offset shape is reused by later paginated collections (MRD §16)."
  type RoomPage {
    items: [Room!]!
    total: Int!
    limit: Int!
    offset: Int!
  }

  "One page of a paginated tenant list (same shape as RoomPage, MRD §16)."
  type TenantPage {
    items: [Tenant!]!
    total: Int!
    limit: Int!
    offset: Int!
  }

  "One page of a paginated rent payment list (same shape as RoomPage, MRD §16)."
  type RentPaymentPage {
    items: [RentPayment!]!
    total: Int!
    limit: Int!
    offset: Int!
  }

  "One page of a paginated complaint list (same shape as RoomPage, MRD §16)."
  type ComplaintPage {
    items: [Complaint!]!
    total: Int!
    limit: Int!
    offset: Int!
  }

  "One page of a paginated announcement list (same shape as RoomPage, MRD §16)."
  type AnnouncementPage {
    items: [Announcement!]!
    total: Int!
    limit: Int!
    offset: Int!
  }

  "Aggregate rent statistics for the admin summary. The status counts use the same live status rule the payment list displays."
  type RentSummary {
    totalPayments: Int!
    totalBilled: Int!
    totalCollected: Int!
    outstandingAmount: Int!
    pendingCount: Int!
    partialCount: Int!
    paidCount: Int!
    overdueCount: Int!
  }
`;
