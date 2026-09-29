export type UserRole = 'Admin' | 'Tenant';

/** Mirrors the GraphQL User type (password is never part of the API). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  name?: string | null;
  phone?: string | null;
}

/** Mirrors the GraphQL Pg type. */
export interface Pg {
  id: string;
  name: string;
  address: string;
  city: string | null;
  contactNumber: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present only when the operation selects rooms (e.g. getAllPgsRooms). */
  rooms?: Room[];
}

/** Mirrors the GraphQL Room type. */
export interface Room {
  id: string;
  roomNumber: string;
  roomType: string | null;
  capacity: number;
  occupiedCount: number;
  rent: number;
  floor: number | null;
  createdAt: string;
  updatedAt: string;
  /** Present only when the operation selects the pg relation. */
  pg?: Pg;
}

/** Mirrors the GraphQL RoomPage type (paginated room list). */
export interface RoomPage {
  items: Room[];
  total: number;
  limit: number;
  offset: number;
}

/** Mirrors the GraphQL Tenant type. */
export interface Tenant {
  id: string;
  name: string;
  phone: string | null;
  emergencyContact: string | null;
  /** Date-only string (YYYY-MM-DD), or null when not set. */
  joinDate: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present only when the operation selects the user relation. */
  user?: AuthUser;
  /** Present only when the operation selects the pg relation. */
  pg?: Pg;
  /** Present only when the operation selects the room relation (null = unassigned). */
  room?: Room | null;
}

/** Mirrors the GraphQL TenantPage type (paginated tenant list). */
export interface TenantPage {
  items: Tenant[];
  total: number;
  limit: number;
  offset: number;
}

/** Mirrors the GraphQL TenantPgRoom type (FR-17). */
export interface TenantPgRoom {
  pg: Pg;
  room: Room | null;
}

/** Admin user-list row: AuthUser plus a marker for the linked tenant record. */
export interface AdminUser extends AuthUser {
  /** Non-null when the user already backs a tenant record (User 1 ─ 0..1 Tenant). */
  tenant?: { id: string } | null;
}

export interface CreatePgInput {
  name: string;
  address: string;
  city?: string | null;
  contactNumber?: string | null;
  description?: string | null;
}

export interface UpdatePgInput {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  contactNumber?: string | null;
  description?: string | null;
}

export interface CreateRoomInput {
  pgId: string;
  roomNumber: string;
  roomType?: string | null;
  capacity: number;
  rent: number;
  floor?: number | null;
}

export interface UpdateRoomInput {
  roomNumber?: string | null;
  roomType?: string | null;
  capacity?: number | null;
  rent?: number | null;
  floor?: number | null;
}

export interface CreateTenantInput {
  userId: string;
  pgId: string;
  roomId?: string | null;
  name: string;
  phone?: string | null;
  emergencyContact?: string | null;
  /** Calendar date in YYYY-MM-DD format. */
  joinDate?: string | null;
}

export interface UpdateTenantInput {
  userId?: string | null;
  name?: string | null;
  phone?: string | null;
  emergencyContact?: string | null;
  joinDate?: string | null;
  pgId?: string | null;
  /** Omit to keep the room; null unassigns it; an id assigns/reassigns it. */
  roomId?: string | null;
}

/** Mirrors the GraphQL PaymentStatus enum (values match the backend exactly, MRD §16). */
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'overdue';

/** Mirrors the GraphQL RentPayment type. Status is always the live derived value. */
export interface RentPayment {
  id: string;
  amount: number;
  paidAmount: number;
  /** Date-only string (YYYY-MM-DD). */
  dueDate: string;
  /** Date-only string (YYYY-MM-DD); set only while the payment is fully paid. */
  paidDate: string | null;
  status: PaymentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present only when the operation selects the tenant relation. */
  tenant?: Tenant;
}

/** Mirrors the GraphQL RentPaymentPage type (paginated payment list). */
export interface RentPaymentPage {
  items: RentPayment[];
  total: number;
  limit: number;
  offset: number;
}

/** Mirrors the GraphQL RentSummary type (admin payment statistics). */
export interface RentSummary {
  totalPayments: number;
  totalBilled: number;
  totalCollected: number;
  outstandingAmount: number;
  pendingCount: number;
  partialCount: number;
  paidCount: number;
  overdueCount: number;
}

export interface CreateRentPaymentInput {
  tenantId: string;
  amount: number;
  paidAmount?: number | null;
  /** Calendar date in YYYY-MM-DD format. */
  dueDate: string;
  /** Calendar date in YYYY-MM-DD format; only kept while fully paid. */
  paidDate?: string | null;
  notes?: string | null;
}

export interface UpdateRentPaymentInput {
  amount?: number | null;
  paidAmount?: number | null;
  dueDate?: string | null;
  paidDate?: string | null;
  notes?: string | null;
}

/** Mirrors the GraphQL ComplaintStatus enum (values match the backend exactly). */
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved';

/** Mirrors the GraphQL Complaint type. */
export interface Complaint {
  id: string;
  title: string;
  description: string;
  status: ComplaintStatus;
  /** ISO timestamp the server sets when the complaint is resolved; null otherwise. */
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present only when the operation selects the tenant relation. */
  tenant?: Tenant;
  /** Present only when the operation selects the pg relation. */
  pg?: Pg;
}

/** Mirrors the GraphQL ComplaintPage type (paginated complaint list). */
export interface ComplaintPage {
  items: Complaint[];
  total: number;
  limit: number;
  offset: number;
}

/** A tenant files a complaint with a title and description only — the tenant
 * record, PG, and open status are all derived by the server. */
export interface CreateComplaintInput {
  title: string;
  description: string;
}

/** Admins manage a complaint; resolvedAt is derived from the status. */
export interface UpdateComplaintInput {
  title?: string | null;
  description?: string | null;
  status?: ComplaintStatus | null;
}

/** Mirrors the GraphQL Announcement type (Phase 8). */
export interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  /** Present only when the operation selects the pg relation. */
  pg?: Pg;
  /** Creator (User 1 ─ * Announcement); present when the operation selects it. */
  createdBy?: AuthUser;
}

/** Mirrors the GraphQL AnnouncementPage type (paginated announcement list). */
export interface AnnouncementPage {
  items: Announcement[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * An admin creates an announcement for a PG. The creator is never taken from
 * input — the server derives it from the calling admin.
 */
export interface CreateAnnouncementInput {
  pgId: string;
  title: string;
  content: string;
}

/** Admins manage the text of an announcement; the PG and creator are fixed. */
export interface UpdateAnnouncementInput {
  title?: string | null;
  content?: string | null;
}

/** Mirrors the GraphQL TenantDocument type (Phase 9). The file itself lives in
 * storage; the record holds only the display metadata and the stored URL. */
export interface TenantDocument {
  id: string;
  docName: string;
  /** Public storage URL of the file. */
  docUrl: string;
  /** Optional reference number (e.g. an ID document number). */
  docNumber: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present only when the operation selects the tenant relation. */
  tenant?: Tenant;
}

/** Mirrors the GraphQL TenantDocumentPage type (paginated document list). */
export interface TenantDocumentPage {
  items: TenantDocument[];
  total: number;
  limit: number;
  offset: number;
}

/** One document recorded by uploadTenantDocs. The storage URL comes from the
 * client's own upload; the tenant is always derived by the server. */
export interface UploadTenantDocInput {
  docName: string;
  docUrl: string;
  docNumber?: string | null;
}

export interface UploadTenantDocsInput {
  docs: UploadTenantDocInput[];
}

/** Partial update: omit/null leaves a field unchanged; '' clears docNumber. */
export interface UpdateTenantDocsInput {
  docName?: string | null;
  docUrl?: string | null;
  docNumber?: string | null;
}

/* ------------------------------------------------------------------------ */
/* Phase 10 — Dashboards                                                     */
/* ------------------------------------------------------------------------ */

/** One property's occupancy row on the admin dashboard chart. */
export interface PropertyOccupancy {
  pgId: string;
  pgName: string;
  totalRooms: number;
  occupiedRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  /** Whole percent of beds occupied (0 when the property has no beds). */
  occupancyPercent: number;
}

/**
 * Mirrors the GraphQL AdminDashboardStats type. Every count is a full-table
 * aggregate from the server, and the payment status counts use the same live
 * status rule the payments page shows.
 */
export interface AdminDashboardStats {
  totalPgs: number;
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  occupancyPercent: number;
  totalTenants: number;
  totalPayments: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  overdueCount: number;
  totalBilled: number;
  totalCollected: number;
  outstandingAmount: number;
  openComplaints: number;
  inProgressComplaints: number;
  resolvedComplaints: number;
  totalAnnouncements: number;
  occupancyByProperty: PropertyOccupancy[];
  recentPayments: RentPaymentPage;
  recentComplaints: ComplaintPage;
}
