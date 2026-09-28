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
