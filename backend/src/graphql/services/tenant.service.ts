import { GraphQLError } from 'graphql';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/db';
import { Pg } from '../../entities/pg.entity';
import { Room } from '../../entities/room.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User, UserRole } from '../../entities/user.entity';

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

export interface TenantListArgs {
  search?: string | null;
  pgId?: string | null;
  limit?: number | null;
  offset?: number | null;
}

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}

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

function optionalText(raw: string | null | undefined, max: number, label: string): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length > max) {
    throw badRequest(`${label} must be ${max} characters or fewer`);
  }
  return trimmed.length === 0 ? null : trimmed;
}

function validateJoinDate(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) {
    return null;
  }
  if (!JOIN_DATE_PATTERN.test(trimmed)) {
    throw badRequest('Join date must be a date in YYYY-MM-DD format');
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw badRequest('Join date is not a valid calendar date');
  }
  return trimmed;
}

async function findLinkableUser(
  userId: string | null | undefined,
  currentTenantId?: string
): Promise<User> {
  const trimmed = typeof userId === 'string' ? userId.trim() : '';
  if (trimmed.length === 0) {
    throw badRequest('A user id is required');
  }
  if (!isUuid(trimmed)) {
    throw badRequest('The selected user does not exist');
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

async function findPgOrThrow(manager: EntityManager, pgId: string | null | undefined): Promise<Pg> {
  const trimmed = typeof pgId === 'string' ? pgId.trim() : '';
  if (trimmed.length === 0) {
    throw badRequest('A PG id is required');
  }
  if (!isUuid(trimmed)) {
    throw badRequest('The selected PG does not exist');
  }
  const pg = await manager.findOne(Pg, { where: { id: trimmed } });
  if (!pg) {
    throw badRequest('The selected PG does not exist');
  }
  return pg;
}

async function lockTenant(manager: EntityManager, id: string): Promise<Tenant> {
  if (!isUuid(id)) {
    throw notFound('Tenant not found');
  }
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

async function lockRoomWithPg(manager: EntityManager, roomId: string): Promise<Room | null> {
  if (!isUuid(roomId)) {
    throw notFound('Room not found');
  }
  return manager
    .getRepository(Room)
    .createQueryBuilder('room')
    .leftJoinAndSelect('room.pg', 'pg')
    .setLock('pessimistic_write', undefined, ['room'])
    .where('room.id = :id', { id: roomId })
    .getOne();
}

function assertRoomInPg(room: Room, pg: Pg): void {
  if (room.pg.id !== pg.id) {
    throw badRequest(`Room ${room.roomNumber} belongs to ${room.pg.name}, not ${pg.name}`);
  }
}

function assertRoomHasFreeBed(room: Room): void {
  if (room.occupiedCount >= room.capacity) {
    throw badRequest(
      `Room ${room.roomNumber} is full (${room.occupiedCount} of ${room.capacity} beds occupied)`
    );
  }
}

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
        room.occupiedCount += 1;
        await manager.getRepository(Room).save(room);
      }
      saved.user = user;
      saved.pg = pg;
      saved.room = room;
      return saved;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw badRequest(`User ${user.email} already has a tenant record`);
    }
    throw error;
  }
}

export async function updateTenant(id: string, input: UpdateTenantInput): Promise<Tenant> {
  const patch = validateScalarPatch(input);

  let user: User | undefined;
  if (typeof input.userId === 'string' && input.userId.trim().length > 0) {
    user = await findLinkableUser(input.userId, id);
  }

  try {
    return await AppDataSource.transaction(async (manager) => {
      const tenant = await lockTenant(manager, id);
      const currentRoom: Room | null = tenant.room ?? null;
      const oldRoomId = currentRoom?.id ?? null;

      const rawPgId = typeof input.pgId === 'string' ? input.pgId.trim() : '';
      let pg = tenant.pg;
      if (rawPgId.length > 0 && rawPgId !== tenant.pg.id) {
        if (!isUuid(rawPgId)) {
          throw badRequest('The selected PG does not exist');
        }
        const target = await manager.findOne(Pg, { where: { id: rawPgId } });
        if (!target) {
          throw badRequest('The selected PG does not exist');
        }
        pg = target;
      }
      const pgChanged = pg.id !== tenant.pg.id;

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
        if (room.id !== oldRoomId) {
          assertRoomHasFreeBed(room);
        }
        newRoom = room;
      }

      const oldRoom = oldRoomId !== null ? lockedRooms.get(oldRoomId) ?? null : null;
      if (oldRoom && (!newRoom || newRoom.id !== oldRoom.id)) {
        oldRoom.occupiedCount -= 1;
        await manager.getRepository(Room).save(oldRoom);
      }
      if (newRoom && (!oldRoom || newRoom.id !== oldRoom.id)) {
        newRoom.occupiedCount += 1;
        await manager.getRepository(Room).save(newRoom);
      }

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
      if (user) {
        saved.user = user;
      }
      saved.pg = pg;
      saved.room = newRoom;
      return saved;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw badRequest(
        `User ${user?.email ?? 'that user'} already has a tenant record`
      );
    }
    throw error;
  }
}

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
    if (!isUuid(pgId)) {
      throw badRequest('The selected PG does not exist');
    }
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
