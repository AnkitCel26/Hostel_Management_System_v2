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

export interface Pg {
  id: string;
  name: string;
  address: string;
  city: string | null;
  contactNumber: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  rooms?: Room[];
}

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
  pg?: Pg;
}

export interface RoomPage {
  items: Room[];
  total: number;
  limit: number;
  offset: number;
}

export interface Tenant {
  id: string;
  name: string;
  phone: string | null;
  emergencyContact: string | null;
  joinDate: string | null;
  createdAt: string;
  updatedAt: string;
  user?: AuthUser;
  pg?: Pg;
  room?: Room | null;
}

export interface TenantPage {
  items: Tenant[];
  total: number;
  limit: number;
  offset: number;
}

export interface TenantPgRoom {
  pg: Pg;
  room: Room | null;
}

export interface AdminUser extends AuthUser {
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
  joinDate?: string | null;
}

export interface UpdateTenantInput {
  userId?: string | null;
  name?: string | null;
  phone?: string | null;
  emergencyContact?: string | null;
  joinDate?: string | null;
  pgId?: string | null;
  roomId?: string | null;
}

export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'overdue';

/** Mirrors the GraphQL RentPayment type. Status is always the live derived value. */
export interface RentPayment {
  id: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  paidDate: string | null;
  status: PaymentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  tenant?: Tenant;
}

export interface RentPaymentPage {
  items: RentPayment[];
  total: number;
  limit: number;
  offset: number;
}

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
  dueDate: string;
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

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved';

export interface Complaint {
  id: string;
  title: string;
  description: string;
  status: ComplaintStatus;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tenant?: Tenant;
  pg?: Pg;
}

export interface ComplaintPage {
  items: Complaint[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateComplaintInput {
  title: string;
  description: string;
}

export interface UpdateComplaintInput {
  title?: string | null;
  description?: string | null;
  status?: ComplaintStatus | null;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pg?: Pg;
  createdBy?: AuthUser;
}

export interface AnnouncementPage {
  items: Announcement[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateAnnouncementInput {
  pgId: string;
  title: string;
  content: string;
}

export interface UpdateAnnouncementInput {
  title?: string | null;
  content?: string | null;
}

export interface TenantDocument {
  id: string;
  docName: string;
  docUrl: string;
  docNumber: string | null;
  createdAt: string;
  updatedAt: string;
  tenant?: Tenant;
}

export interface TenantDocumentPage {
  items: TenantDocument[];
  total: number;
  limit: number;
  offset: number;
}

export interface UploadTenantDocInput {
  docName: string;
  docUrl: string;
  docNumber?: string | null;
}

export interface UploadTenantDocsInput {
  docs: UploadTenantDocInput[];
}

export interface UpdateTenantDocsInput {
  docName?: string | null;
  docUrl?: string | null;
  docNumber?: string | null;
}

export interface PropertyOccupancy {
  pgId: string;
  pgName: string;
  totalRooms: number;
  occupiedRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  occupancyPercent: number;
}

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
