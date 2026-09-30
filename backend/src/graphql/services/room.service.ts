import { GraphQLError } from 'graphql';
import { AppDataSource } from '../../config/db';
import { Pg } from '../../entities/pg.entity';
import { Room } from '../../entities/room.entity';

export interface CreateRoomInput {
  pgId: string;
  roomNumber: string;
  roomType?: string | null;
  capacity: number;
  rent: number;
  floor?: number | null;
}

/** Partial update: undefined and null leave a field unchanged, '' clears it. */
export interface UpdateRoomInput {
  roomNumber?: string | null;
  roomType?: string | null;
  capacity?: number | null;
  rent?: number | null;
  floor?: number | null;
}

/** Query args for the paginated room list. */
export interface RoomListArgs {
  search?: string | null;
  pgId?: string | null;
  limit?: number | null;
  offset?: number | null;
}

/** Result shape for the paginated room list. */
export interface RoomPage {
  items: Room[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const ROOM_NUMBER_MIN = 1;
const ROOM_NUMBER_MAX = 20;
const ROOM_TYPE_MAX = 30;
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 100;
const RENT_MIN = 0;
const RENT_MAX = 10_000_000;
const FLOOR_MIN = 0;
const FLOOR_MAX = 200;

function roomRepo() {
  return AppDataSource.getRepository(Room);
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

/** Postgres uuid columns reject anything that is not a uuid with a 22P02 error. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guards the id inputs: a malformed id can never match a row, so it is
 * reported with the same BAD_USER_INPUT / NOT_FOUND answer as a
 * well-formed id that does not exist. Without this guard the uuid column
 * error would surface as an internal server error.
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** PostgreSQL unique-constraint violation (23505). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}

function validateRoomNumber(raw: string | null | undefined): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length < ROOM_NUMBER_MIN || trimmed.length > ROOM_NUMBER_MAX) {
    throw badRequest(
      `Room number must be between ${ROOM_NUMBER_MIN} and ${ROOM_NUMBER_MAX} characters`
    );
  }
  return trimmed;
}

/** Optional room type: '' and null both persist as null (no value). */
function validateRoomType(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length > ROOM_TYPE_MAX) {
    throw badRequest(`Room type must be ${ROOM_TYPE_MAX} characters or fewer`);
  }
  return trimmed.length === 0 ? null : trimmed;
}

function validateInt(
  raw: number | null | undefined,
  min: number,
  max: number,
  label: string
): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min || raw > max) {
    throw badRequest(`${label} must be a whole number between ${min} and ${max}`);
  }
  return raw;
}

/** Resolves the PG a room is being created under (rooms are linked to PGs). */
async function findPgOrThrow(pgId: string | null | undefined): Promise<Pg> {
  const trimmed = typeof pgId === 'string' ? pgId.trim() : '';
  if (trimmed.length === 0) {
    throw badRequest('A PG id is required');
  }
  if (!isUuid(trimmed)) {
    throw badRequest('The selected PG does not exist');
  }
  const pg = await pgRepo().findOne({ where: { id: trimmed } });
  if (!pg) {
    throw badRequest('The selected PG does not exist');
  }
  return pg;
}

/**
 * Friendly duplicate check for room numbers within a PG. The database unique
 * constraint (pg, roomNumber) remains the source of truth for races.
 */
async function assertRoomNumberAvailable(
  pgId: string,
  roomNumber: string,
  excludeRoomId?: string
): Promise<void> {
  const existing = await roomRepo().findOne({ where: { pg: { id: pgId }, roomNumber } });
  if (existing && existing.id !== excludeRoomId) {
    throw badRequest(`Room number ${roomNumber} is already used in this PG`);
  }
}

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  const pg = await findPgOrThrow(input.pgId);
  const roomNumber = validateRoomNumber(input.roomNumber);
  await assertRoomNumberAvailable(pg.id, roomNumber);

  const room = roomRepo().create({
    pg,
    roomNumber,
    roomType: validateRoomType(input.roomType),
    capacity: validateInt(input.capacity, CAPACITY_MIN, CAPACITY_MAX, 'Capacity'),
    rent: validateInt(input.rent, RENT_MIN, RENT_MAX, 'Rent'),
    floor:
      input.floor !== undefined && input.floor !== null
        ? validateInt(input.floor, FLOOR_MIN, FLOOR_MAX, 'Floor')
        : null,
    // Occupancy is system-managed (FR-11): rooms always start empty and are
    // advanced only by tenant assignment (Phase 5).
    occupiedCount: 0
  });

  try {
    return await roomRepo().save(room);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw badRequest(`Room number ${roomNumber} is already used in this PG`);
    }
    throw error;
  }
}

/**
 * Rooms cannot be moved between PGs (tenants reference the room from their own
 * PG), so pgId is intentionally not accepted here.
 */
export async function updateRoom(id: string, input: UpdateRoomInput): Promise<Room> {
  if (!isUuid(id)) {
    throw notFound('Room not found');
  }
  const room = await roomRepo().findOne({ where: { id }, relations: { pg: true } });
  if (!room) {
    throw notFound('Room not found');
  }

  if (input.roomNumber !== undefined && input.roomNumber !== null) {
    room.roomNumber = validateRoomNumber(input.roomNumber);
    await assertRoomNumberAvailable(room.pg.id, room.roomNumber, room.id);
  }
  if (input.roomType !== undefined && input.roomType !== null) {
    room.roomType = validateRoomType(input.roomType);
  }
  if (input.capacity !== undefined && input.capacity !== null) {
    const capacity = validateInt(input.capacity, CAPACITY_MIN, CAPACITY_MAX, 'Capacity');
    // Occupancy consistency: never strand more tenants than the room can hold.
    if (capacity < room.occupiedCount) {
      throw badRequest(
        `Capacity cannot be lower than the current occupancy (${room.occupiedCount} tenant(s) are assigned to this room)`
      );
    }
    room.capacity = capacity;
  }
  if (input.rent !== undefined && input.rent !== null) {
    room.rent = validateInt(input.rent, RENT_MIN, RENT_MAX, 'Rent');
  }
  if (input.floor !== undefined && input.floor !== null) {
    room.floor = validateInt(input.floor, FLOOR_MIN, FLOOR_MAX, 'Floor');
  }

  return roomRepo().save(room);
}

/**
 * Searchable, paginated room list (FR-12). Search matches room number and room
 * type case-insensitively; pgId restricts to one PG. Newest rooms first, with
 * a deterministic id tiebreak so pagination is stable.
 */
export async function getAllRooms(args: RoomListArgs): Promise<RoomPage> {
  const limit = args.limit ?? DEFAULT_PAGE_SIZE;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw badRequest(`limit must be a whole number between 1 and ${MAX_PAGE_SIZE}`);
  }
  const offset = args.offset ?? 0;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw badRequest('offset must be a whole number of 0 or greater');
  }

  const queryBuilder = roomRepo()
    .createQueryBuilder('room')
    .leftJoinAndSelect('room.pg', 'pg')
    .orderBy('room.createdAt', 'DESC')
    .addOrderBy('room.id', 'DESC');

  if (typeof args.pgId === 'string' && args.pgId.trim().length > 0) {
    const pg = await findPgOrThrow(args.pgId);
    queryBuilder.andWhere('pg.id = :pgId', { pgId: pg.id });
  }

  const search = typeof args.search === 'string' ? args.search.trim() : '';
  if (search.length > 0) {
    queryBuilder.andWhere(
      '(LOWER(room.roomNumber) LIKE :term OR LOWER(room.roomType) LIKE :term)',
      { term: `%${search.toLowerCase()}%` }
    );
  }

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}

/** Rooms of one PG ordered by room number (used by the Pg.rooms field resolver). */
export async function getRoomsForPg(pgId: string): Promise<Room[]> {
  return roomRepo().find({
    where: { pg: { id: pgId } },
    order: { roomNumber: 'ASC', createdAt: 'ASC' },
    relations: { pg: true }
  });
}
