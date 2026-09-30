import { GraphQLError } from 'graphql';
import { In } from 'typeorm';
import { AppDataSource } from '../../config/db';
import { Pg } from '../../entities/pg.entity';
import { Room } from '../../entities/room.entity';
import { Tenant } from '../../entities/tenant.entity';

export interface CreatePgInput {
  name: string;
  address: string;
  city?: string | null;
  contactNumber?: string | null;
  description?: string | null;
}

/** Partial update: undefined and null leave a field unchanged, '' clears it. */
export interface UpdatePgInput {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  contactNumber?: string | null;
  description?: string | null;
}

/** Result shape for the getTenantPgRoom query. */
export interface TenantPgRoomResult {
  pg: Pg;
  room: Room | null;
}

const NAME_MIN = 2;
const NAME_MAX = 120;
const ADDRESS_MIN = 1;
const ADDRESS_MAX = 255;
const CITY_MAX = 80;
const CONTACT_MAX = 20;
const DESCRIPTION_MAX = 2000;

function pgRepo() {
  return AppDataSource.getRepository(Pg);
}

function roomRepo() {
  return AppDataSource.getRepository(Room);
}

function tenantRepo() {
  return AppDataSource.getRepository(Tenant);
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
 * reported with the same NOT_FOUND answer as a well-formed id that does
 * not exist. Without this guard the uuid column error would surface as
 * an internal server error.
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
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

/**
 * Validates input and applies it onto a PG instance.
 * Used by both create (schema guarantees name/address presence) and update.
 */
function applyPgFields(pg: Pg, input: UpdatePgInput): Pg {
  if (input.name !== undefined && input.name !== null) {
    pg.name = requiredText(input.name, NAME_MIN, NAME_MAX, 'Name');
  }
  if (input.address !== undefined && input.address !== null) {
    pg.address = requiredText(input.address, ADDRESS_MIN, ADDRESS_MAX, 'Address');
  }
  if (input.city !== undefined && input.city !== null) {
    pg.city = optionalText(input.city, CITY_MAX, 'City');
  }
  if (input.contactNumber !== undefined && input.contactNumber !== null) {
    pg.contactNumber = optionalText(input.contactNumber, CONTACT_MAX, 'Contact number');
  }
  if (input.description !== undefined && input.description !== null) {
    pg.description = optionalText(input.description, DESCRIPTION_MAX, 'Description');
  }
  return pg;
}

export async function createPg(input: CreatePgInput): Promise<Pg> {
  const pg = applyPgFields(pgRepo().create(), input);
  return pgRepo().save(pg);
}

export async function updatePg(id: string, input: UpdatePgInput): Promise<Pg> {
  if (!isUuid(id)) {
    throw notFound('PG not found');
  }
  const pg = await pgRepo().findOne({ where: { id } });
  if (!pg) {
    throw notFound('PG not found');
  }
  applyPgFields(pg, input);
  return pgRepo().save(pg);
}

export async function getAllPgs(): Promise<Pg[]> {
  return pgRepo().find({ order: { createdAt: 'DESC' } });
}

/**
 * All PGs with their rooms attached (PGs newest first, rooms ordered by room
 * number). Rooms are fetched in one batched query instead of one per PG, and
 * each room carries its PG so nested Room.pg resolves without extra work.
 */
export async function getAllPgsRooms(): Promise<Pg[]> {
  const pgs = await pgRepo().find({ order: { createdAt: 'DESC' } });
  if (pgs.length === 0) {
    return pgs;
  }

  const rooms = await roomRepo().find({
    where: { pg: { id: In(pgs.map((pg) => pg.id)) } },
    order: { roomNumber: 'ASC', createdAt: 'ASC' },
    relations: { pg: true }
  });

  const roomsByPgId = new Map<string, Room[]>();
  for (const room of rooms) {
    const bucket = roomsByPgId.get(room.pg.id);
    if (bucket) {
      bucket.push(room);
    } else {
      roomsByPgId.set(room.pg.id, [room]);
    }
  }
  for (const pg of pgs) {
    pg.rooms = roomsByPgId.get(pg.id) ?? [];
  }
  return pgs;
}

/**
 * The tenant-facing query (FR-17): the current user's assigned PG and room.
 * Returns null while the user has no tenant record — assignment is created by
 * tenant management (Phase 5), so "not assigned yet" is a valid empty state.
 */
export async function getTenantPgRoom(userId: string): Promise<TenantPgRoomResult | null> {
  const tenant = await tenantRepo().findOne({
    where: { user: { id: userId } },
    relations: { pg: true, room: true }
  });
  if (!tenant) {
    return null;
  }
  return { pg: tenant.pg, room: tenant.room ?? null };
}
