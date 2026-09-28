import { GraphQLError } from 'graphql';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/db';
import { Pg } from '../../entities/pg.entity';
import { Room } from '../../entities/room.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User, UserRole } from '../../entities/user.entity';

/**
 * Tenant management (Phase 5): tenant creation/update, PG and room
 * assignment, room reassignment, and the searchable, paginated tenant list.
 *
 * Occupancy is the core invariant (FR-16, MRD §16): every room's
 * `occupiedCount` must always equal the number of tenants assigned to it.
 * All tenant/room state therefore changes inside one database transaction
 * (FR-35) that takes row locks (`SELECT ... FOR UPDATE`) on the affected
 * room rows, so:
 *   - two admins racing for a room's last bed can never both succeed;
 *   - a reassignment's decrement and increment commit or roll back together.
 *
 * Lock order: the tenant row first, then every affected room row in
 * ascending id order — a global order that rules out AB-BA deadlocks when
 * one tenant moves R1→R2 while another moves R2→R1.
 *
 * `occupiedCount` is never accepted from input: rooms own it, and only
 * these assignment paths are allowed to move it.
 */

export interface CreateTenantInput {
  userId: string;
  pgId: string;
  roomId?: string | null;
  name: string;
  phone?: string | null;
  emergencyContact?: string | null;
  joinDate?: string | null;
}

/**
 * Partial update semantics (same as the PG/room services): undefined/null
 * leaves a field unchanged and '' clears an optional field. `roomId` is the
 * one tri-state field — undefined keeps the assignment, null/'' releases it,
 * and an id assigns/reassigns.
 */
export interface UpdateTenantInput {
  userId?: string | null;
  name?: string | null;
  phone?: string | null;
  emergencyContact?: string | null;
  joinDate?: string | null;
  pgId?: string | null;
  roomId?: string | null;
}

/** Query args for the paginated tenant list. */
export interface TenantListArgs {
  search?: string | null;
  pgId?: string | null;
  limit?: number | null;
  offset?: number | null;
}

/** Result shape for the paginated tenant list (mirrors RoomPage, MRD §16). */
export interface TenantPage {
  items: Tenant[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const NAME_MIN = 2;
const NAME_MAX = 120;
const PHONE_MAX = 20;
const EMERGENCY_CONTACT_MAX = 120;
const JOIN_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function tenantRepo() {
  return AppDataSource.getRepository(Tenant);
}

function userRepo() {
  return AppDataSource.getRepository(User);
}

function pgRepo() {
  return AppDataSource.getRepository(Pg);
}

function badRequest(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } }
  });
}

function notFound(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'NOT_FOUND', http: { status: 404 } }
  });
}

/** PostgreSQL unique-constraint violation (23505). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}

/** Required text: trimmed and length-checked against the column limits. */
function requiredText(
  raw: string | null | undefined,
  min: number,
  max: number,
  label: string
): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length < min || trimmed.length > max) {
    throw badRequest(`${label} must be between ${min} and ${max} characters`);
  }
  return trimmed;
}

/** Optional text: '' and null both persist as null (no value). */
function optionalText(raw: string | null | undefined, max: number, label: string): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length > max) {
    throw badRequest(`${label} must be ${max} characters or fewer`);
  }
  return trimmed.length === 0 ? null : trimmed;
}

/** Optional calendar date: '' and null persist as null; must be a real YYYY-MM-DD date. */
function validateJoinDate(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) {
    return null;
  }
  if (!JOIN_DATE_PATTERN.test(trimmed)) {
    throw badRequest('Join date must be a date in YYYY-MM-DD format');
  }
  // A round-trip through UTC rejects impossible dates such as 2026-02-30.
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw badRequest('Join date is not a valid calendar date');
  }
  return trimmed;
}

/**
 * Validates the user a tenant record is being linked to (FR-15): the user
 * must exist, hold the Tenant role, and not already be linked to another
 * tenant record (User 1 ─ 0..1 Tenant). `currentTenantId` lets an update
 * re-affirm its own user.
 *
 * Deliberately a friendly pre-check outside the assignment transaction —
 * the UNIQUE(userId) constraint is the backstop when two admins race to
 * claim the same user (mapped to a readable message in the catch blocks).
 */
async function findLinkableUser(
  userId: string | null | undefined,
  currentTenantId?: string
): Promise<User> {
  const trimmed = typeof userId === 'string' ? userId.trim() : '';
  if (trimmed.length === 0) {
    throw badRequest('A user id is required');
  }
  const user = await userRepo().findOne({ where: { id: trimmed } });
  if (!user) {
    throw badRequest('The selected user does not exist');
  }
  if (user.role !== UserRole.Tenant) {
    throw badRequest('Only Tenant-role users can be linked to a tenant record');
  }
  const linked = await tenantRepo().findOne({ where: { user: { id: user.id } } });
  if (linked && linked.id !== currentTenantId) {
    throw badRequest(`User ${user.email} already has a tenant record`);
  }
  return user;
}

/** Resolves the PG a tenant is being created under (tenants must belong to a PG). */
async function findPgOrThrow(manager: EntityManager, pgId: string | null | undefined): Promise<Pg> {
  const trimmed = typeof pgId === 'string' ? pgId.trim() : '';
  if (trimmed.length === 0) {
    throw badRequest('A PG id is required');
  }
  const pg = await manager.findOne(Pg, { where: { id: trimmed } });
  if (!pg) {
    throw badRequest('The selected PG does not exist');
  }
  return pg;
}

/**
 * Locks the tenant row (SELECT ... FOR UPDATE) and loads it with its user,
 * PG, and room. Concurrent updates of the same tenant serialize here, so
 * two reassignments can never interleave their occupancy adjustments.
 * Only the tenant row is locked — the relations are read-only reference
 * data for this operation.
 */
async function lockTenant(manager: EntityManager, id: string): Promise<Tenant> {
  const tenant = await manager
    .getRepository(Tenant)
    .createQueryBuilder('tenant')
    .leftJoinAndSelect('tenant.user', 'user')
    .leftJoinAndSelect('tenant.pg', 'pg')
    .leftJoinAndSelect('tenant.room', 'room')
    .setLock('pessimistic_write', undefined, ['tenant'])
    .where('tenant.id = :id', { id })
    .getOne();
  if (!tenant) {
    throw notFound('Tenant not found');
  }
  return tenant;
}

/**
 * Locks a room row and loads it with its PG. Only the room row is locked
 * (`FOR UPDATE OF "room"`), keeping the lock scope minimal while making the
 * occupancy read and the later write inside this transaction atomic.
 */
async function lockRoomWithPg(manager: EntityManager, roomId: string): Promise<Room | null> {
  return manager
    .getRepository(Room)
    .createQueryBuilder('room')
    .leftJoinAndSelect('room.pg', 'pg')
    .setLock('pessimistic_write', undefined, ['room'])
    .where('room.id = :id', { id: roomId })
    .getOne();
}

/** A room being assigned must belong to the tenant's PG (FR-15). */
function assertRoomInPg(room: Room, pg: Pg): void {
  if (room.pg.id !== pg.id) {
    throw badRequest(`Room ${room.roomNumber} belongs to ${room.pg.name}, not ${pg.name}`);
  }
}

/** A room taking a new tenant needs a free bed, checked on the locked row (FR-15). */
function assertRoomHasFreeBed(room: Room): void {
  if (room.occupiedCount >= room.capacity) {
    throw badRequest(
      `Room ${room.roomNumber} is full (${room.occupiedCount} of ${room.capacity} beds occupied)`
    );
  }
}

/** Scalar fields validated once, outside the transaction. */
interface TenantScalarPatch {
  name?: string;
  phone?: string | null;
  emergencyContact?: string | null;
  joinDate?: string | null;
}

function validateScalarPatch(input: UpdateTenantInput): TenantScalarPatch {
  const patch: TenantScalarPatch = {};
  if (input.name !== undefined && input.name !== null) {
    patch.name = requiredText(input.name, NAME_MIN, NAME_MAX, 'Name');
  }
  if (input.phone !== undefined && input.phone !== null) {
    patch.phone = optionalText(input.phone, PHONE_MAX, 'Phone');
  }
  if (input.emergencyContact !== undefined && input.emergencyContact !== null) {
    patch.emergencyContact = optionalText(
      input.emergencyContact,
      EMERGENCY_CONTACT_MAX,
      'Emergency contact'
    );
  }
  if (input.joinDate !== undefined && input.joinDate !== null) {
    patch.joinDate = validateJoinDate(input.joinDate);
  }
  return patch;
}

export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const name = requiredText(input.name, NAME_MIN, NAME_MAX, 'Name');
  const phone = optionalText(input.phone, PHONE_MAX, 'Phone');
  const emergencyContact = optionalText(input.emergencyContact, EMERGENCY_CONTACT_MAX, 'Emergency contact');
  const joinDate = validateJoinDate(input.joinDate);

  const user = await findLinkableUser(input.userId);
  const roomId = typeof input.roomId === 'string' ? input.roomId.trim() : '';

  try {
    return await AppDataSource.transaction(async (manager) => {
      const pg = await findPgOrThrow(manager, input.pgId);

      let room: Room | null = null;
      if (roomId.length > 0) {
        room = await lockRoomWithPg(manager, roomId);
        if (!room) {
          throw notFound('Room not found');
        }
        assertRoomInPg(room, pg);
        assertRoomHasFreeBed(room);
      }

      const tenant = manager.getRepository(Tenant).create({
        user,
        pg,
        room,
        name,
        phone,
        emergencyContact,
        joinDate
      });
      const saved = await manager.getRepository(Tenant).save(tenant);

      if (room) {
        // FR-16: occupancy advances atomically with the assignment.
        room.occupiedCount += 1;
        await manager.getRepository(Room).save(room);
      }
      // create()/save() may return relation clones of the input literal, so
      // re-attach the live entities: the response must reflect this write,
      // including the incremented occupancy.
      saved.user = user;
      saved.pg = pg;
      saved.room = room;
      return saved;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // tenants.userId is the only unique constraint this insert can hit:
      // another admin linked this user to a tenant record first.
      throw badRequest(`User ${user.email} already has a tenant record`);
    }
    throw error;
  }
}

export async function updateTenant(id: string, input: UpdateTenantInput): Promise<Tenant> {
  const patch = validateScalarPatch(input);

  // User re-link validation runs before the transaction (fail fast, before
  // any locks are taken); the UNIQUE(userId) constraint backs the race.
  let user: User | undefined;
  if (typeof input.userId === 'string' && input.userId.trim().length > 0) {
    user = await findLinkableUser(input.userId, id);
  }

  try {
    return await AppDataSource.transaction(async (manager) => {
      const tenant = await lockTenant(manager, id);
      const currentRoom: Room | null = tenant.room ?? null;
      const oldRoomId = currentRoom?.id ?? null;

      // --- PG intent: omit/null/'' keeps the current PG (it cannot be cleared).
      const rawPgId = typeof input.pgId === 'string' ? input.pgId.trim() : '';
      let pg = tenant.pg;
      if (rawPgId.length > 0 && rawPgId !== tenant.pg.id) {
        const target = await manager.findOne(Pg, { where: { id: rawPgId } });
        if (!target) {
          throw badRequest('The selected PG does not exist');
        }
        pg = target;
      }
      const pgChanged = pg.id !== tenant.pg.id;

      // --- Room intent: undefined keeps, null/'' releases, an id assigns/reassigns.
      let newRoomId: string | null;
      if (input.roomId === undefined) {
        newRoomId = oldRoomId;
      } else {
        const trimmed = typeof input.roomId === 'string' ? input.roomId.trim() : '';
        newRoomId = trimmed.length > 0 ? trimmed : null;
      }

      // Keeping the current room while moving to another PG is impossible:
      // the room belongs to the old PG. Force an explicit room decision.
      if (pgChanged && input.roomId === undefined && currentRoom) {
        throw badRequest(
          `Room ${currentRoom.roomNumber} belongs to ${tenant.pg.name}; assign a room in ${pg.name} or clear the room in the same update`
        );
      }

      // Lock every room this update touches, in ascending id order — the
      // global lock order that prevents AB-BA deadlocks between concurrent
      // reassignments (one tenant moving R1→R2 while another moves R2→R1).
      const roomIdsToLock = [...new Set([oldRoomId, newRoomId])]
        .filter((roomId): roomId is string => roomId !== null)
        .sort();
      const lockedRooms = new Map<string, Room>();
      for (const roomId of roomIdsToLock) {
        const room = await lockRoomWithPg(manager, roomId);
        if (room) {
          lockedRooms.set(room.id, room);
        }
      }

      let newRoom: Room | null = null;
      if (newRoomId !== null) {
        const room = lockedRooms.get(newRoomId);
        if (!room) {
          throw notFound('Room not found');
        }
        assertRoomInPg(room, pg);
        // Staying in the same room changes nothing (the tenant already holds
        // a bed there); any other target needs a free bed.
        if (room.id !== oldRoomId) {
          assertRoomHasFreeBed(room);
        }
        newRoom = room;
      }

      // --- Occupancy deltas (FR-16): exactly one increment and/or one
      // decrement, each persisted on its locked row.
      const oldRoom = oldRoomId !== null ? lockedRooms.get(oldRoomId) ?? null : null;
      if (oldRoom && (!newRoom || newRoom.id !== oldRoom.id)) {
        oldRoom.occupiedCount -= 1;
        await manager.getRepository(Room).save(oldRoom);
      }
      if (newRoom && (!oldRoom || newRoom.id !== oldRoom.id)) {
        newRoom.occupiedCount += 1;
        await manager.getRepository(Room).save(newRoom);
      }

      // --- Apply the validated changes.
      if (patch.name !== undefined) {
        tenant.name = patch.name;
      }
      if (patch.phone !== undefined) {
        tenant.phone = patch.phone;
      }
      if (patch.emergencyContact !== undefined) {
        tenant.emergencyContact = patch.emergencyContact;
      }
      if (patch.joinDate !== undefined) {
        tenant.joinDate = patch.joinDate;
      }
      if (user) {
        tenant.user = user;
      }
      tenant.pg = pg;
      tenant.room = newRoom;

      const saved = await manager.getRepository(Tenant).save(tenant);
      // Re-attach the live entities in case save() returned relation clones:
      // the response must reflect this update, including the rooms' new
      // occupancy (the shared entities already carry the deltas above).
      if (user) {
        saved.user = user;
      }
      saved.pg = pg;
      saved.room = newRoom;
      return saved;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Only the userId re-link can violate a unique constraint here.
      throw badRequest(
        `User ${user?.email ?? 'that user'} already has a tenant record`
      );
    }
    throw error;
  }
}

/**
 * Searchable, paginated tenant list. Search matches the tenant name, the
 * tenant phone, and the linked user's email case-insensitively; pgId
 * restricts to one PG. Newest tenants first with a deterministic id
 * tiebreak, mirroring getAllRooms (MRD §16: consistent pagination).
 */
export async function getAllTenants(args: TenantListArgs): Promise<TenantPage> {
  const limit = args.limit ?? DEFAULT_PAGE_SIZE;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw badRequest(`limit must be a whole number between 1 and ${MAX_PAGE_SIZE}`);
  }
  const offset = args.offset ?? 0;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw badRequest('offset must be a whole number of 0 or greater');
  }

  const queryBuilder = tenantRepo()
    .createQueryBuilder('tenant')
    .leftJoinAndSelect('tenant.user', 'user')
    .leftJoinAndSelect('tenant.pg', 'pg')
    .leftJoinAndSelect('tenant.room', 'room')
    .orderBy('tenant.createdAt', 'DESC')
    .addOrderBy('tenant.id', 'DESC');

  const pgId = typeof args.pgId === 'string' ? args.pgId.trim() : '';
  if (pgId.length > 0) {
    const pg = await pgRepo().findOne({ where: { id: pgId } });
    if (!pg) {
      throw badRequest('The selected PG does not exist');
    }
    queryBuilder.andWhere('pg.id = :pgId', { pgId: pg.id });
  }

  const search = typeof args.search === 'string' ? args.search.trim() : '';
  if (search.length > 0) {
    queryBuilder.andWhere(
      '(LOWER(tenant.name) LIKE :term OR LOWER(tenant.phone) LIKE :term OR LOWER(user.email) LIKE :term)',
      { term: `%${search.toLowerCase()}%` }
    );
  }

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}
