import { GraphQLError } from 'graphql';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/db';
import { Announcement } from '../../entities/announcement.entity';
import { Pg } from '../../entities/pg.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';

/**
 * Announcement management (Phase 8): admin announcement creation and update
 * for a PG, plus PG-scoped retrieval (FR-25 through FR-27).
 *
 * Role boundaries (mirroring the payment/complaint services):
 * - createAnnouncement and updateAnnouncement are admin-only at the resolver.
 *   The creator (createdBy) is always the CALLER — never accepted from input
 *   — so an announcement can never be attributed to another user.
 * - An announcement is created for one PG (pgId in the create input); the PG
 *   is validated before the insert, and announcements can never be moved
 *   between PGs (updateAnnouncement accepts no pgId).
 * - getTenantPgAnnouncements is tenant-only and scoped to the CALLER's own
 *   tenant record's PG — no pgId is accepted from input, so a tenant can
 *   never read another PG's announcements. A Tenant-role user without a
 *   tenant record (no PG assignment yet) sees a valid empty page, not an
 *   error.
 *
 * Updates run inside a transaction that row-locks the announcement (the same
 * pessimistic-lock pattern as Phases 5/6/7), so concurrent
 * read-modify-write updates of one announcement serialize instead of losing
 * updates.
 */

/** createAnnouncement input. createdBy is system-derived from the caller. */
export interface CreateAnnouncementInput {
  pgId: string;
  title: string;
  content: string;
}

/**
 * Partial update semantics (same as the PG/room/tenant/payment/complaint
 * services): undefined and null leave a field unchanged. pgId is never
 * accepted — an announcement cannot move to another PG.
 */
export interface UpdateAnnouncementInput {
  title?: string | null;
  content?: string | null;
}

/** Query args for the paginated, filterable admin announcement list. */
export interface AnnouncementListArgs {
  search?: string | null;
  pgId?: string | null;
  limit?: number | null;
  offset?: number | null;
}

/** Query args for the tenant-facing announcement list (pagination only). */
export interface AnnouncementHistoryArgs {
  limit?: number | null;
  offset?: number | null;
}

/** Result shape for the paginated announcement collections (mirrors RoomPage, MRD §16). */
export interface AnnouncementPage {
  items: Announcement[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const TITLE_MAX = 160; // must match the announcements.title column (varchar 160)
const CONTENT_MAX = 5000;

function announcementRepo() {
  return AppDataSource.getRepository(Announcement);
}

function tenantRepo() {
  return AppDataSource.getRepository(Tenant);
}

function pgRepo() {
  return AppDataSource.getRepository(Pg);
}

function userRepo() {
  return AppDataSource.getRepository(User);
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

/** PostgreSQL foreign-key violation (23503): the referenced row is gone. */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23503'
  );
}

/** Required text: trimmed, non-empty, within the column limit. */
function requiredText(
  raw: string | null | undefined,
  max: number,
  label: string
): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) {
    throw badRequest(`${label} is required and cannot be empty`);
  }
  if (trimmed.length > max) {
    throw badRequest(`${label} must be ${max} characters or fewer`);
  }
  return trimmed;
}

/** Pagination bounds shared by both announcement lists (MRD §16). */
function validatePage(
  limitRaw: number | null | undefined,
  offsetRaw: number | null | undefined
): { limit: number; offset: number } {
  const limit = limitRaw ?? DEFAULT_PAGE_SIZE;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw badRequest(`limit must be a whole number between 1 and ${MAX_PAGE_SIZE}`);
  }
  const offset = offsetRaw ?? 0;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw badRequest('offset must be a whole number of 0 or greater');
  }
  return { limit, offset };
}

/** Postgres uuid columns reject anything that is not a uuid with a 22P02 error. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guards the id inputs: a malformed id can never match a row, so it is
 * reported with the same NOT_FOUND / BAD_USER_INPUT answer as a well-formed
 * id that does not exist. Without this guard the uuid column error would
 * surface as an internal server error.
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** The PG an announcement belongs to: validated before the write. */
async function findPgOrFail(pgId: string): Promise<Pg> {
  if (!isUuid(pgId)) {
    throw badRequest('The selected PG does not exist');
  }
  const pg = await pgRepo().findOne({ where: { id: pgId } });
  if (!pg) {
    throw badRequest('The selected PG does not exist');
  }
  return pg;
}

/**
 * Locks the announcement row (SELECT ... FOR UPDATE) and loads it with its
 * PG and creator. Concurrent updates of the same announcement serialize
 * here, so concurrent partial updates cannot interleave or lose updates.
 * Only the announcement row is locked — the PG and creator are read-only
 * reference data for this operation.
 */
async function lockAnnouncement(
  manager: EntityManager,
  id: string
): Promise<Announcement> {
  if (!isUuid(id)) {
    throw notFound('Announcement not found');
  }
  const announcement = await manager
    .getRepository(Announcement)
    .createQueryBuilder('announcement')
    .leftJoinAndSelect('announcement.pg', 'pg')
    .leftJoinAndSelect('announcement.createdBy', 'createdBy')
    .setLock('pessimistic_write', undefined, ['announcement'])
    .where('announcement.id = :id', { id })
    .getOne();
  if (!announcement) {
    throw notFound('Announcement not found');
  }
  return announcement;
}

/**
 * Creates an announcement (FR-25). The caller is an Admin-role user; the
 * announcement belongs to the validated PG and is attributed to the caller.
 */
export async function createAnnouncement(
  userId: string,
  input: CreateAnnouncementInput
): Promise<Announcement> {
  const title = requiredText(input.title, TITLE_MAX, 'Title');
  const content = requiredText(input.content, CONTENT_MAX, 'Content');
  const pgId = typeof input.pgId === 'string' ? input.pgId.trim() : '';
  if (pgId.length === 0) {
    throw badRequest('A PG must be selected for the announcement');
  }

  const pg = await findPgOrFail(pgId);
  const createdBy = await userRepo().findOne({ where: { id: userId } });
  if (!createdBy) {
    // Unreachable while the access token is only issued for a stored user,
    // but kept as a hard guard: announcements must be attributable.
    throw badRequest('The announcement could not be attributed to the current user');
  }

  const announcement = announcementRepo().create({
    pg,
    createdBy,
    title,
    content
  });

  try {
    const saved = await announcementRepo().save(announcement);
    // create()/save() may return relation clones of the input literal, so
    // re-attach the live entities (same convention as Phases 5/6/7).
    saved.pg = pg;
    saved.createdBy = createdBy;
    return saved;
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      // The PG (or the caller's user) was deleted between the check and the insert.
      throw badRequest('The announcement could not be created because the PG no longer exists');
    }
    throw error;
  }
}

/**
 * Updates an announcement (FR-26, admin-only at the resolver). Title and
 * content follow partial-update semantics; the PG and creator are never
 * taken from input. Runs under a row lock so concurrent updates of one
 * announcement cannot interleave.
 */
export async function updateAnnouncement(
  id: string,
  input: UpdateAnnouncementInput
): Promise<Announcement> {
  // Scalar validation runs before the transaction (fail fast, no locks yet).
  const title =
    input.title !== undefined && input.title !== null
      ? requiredText(input.title, TITLE_MAX, 'Title')
      : undefined;
  const content =
    input.content !== undefined && input.content !== null
      ? requiredText(input.content, CONTENT_MAX, 'Content')
      : undefined;

  return AppDataSource.transaction(async (manager) => {
    const announcement = await lockAnnouncement(manager, id);

    if (title !== undefined) {
      announcement.title = title;
    }
    if (content !== undefined) {
      announcement.content = content;
    }

    const saved = await manager.getRepository(Announcement).save(announcement);
    // Re-attach the live relations in case save() returned a relation clone.
    saved.pg = announcement.pg;
    saved.createdBy = announcement.createdBy;
    return saved;
  });
}

/**
 * The tenant-facing announcement list (FR-27): announcements of the current
 * user's own PG, newest first. A Tenant-role user without a tenant record
 * (no assignment yet) sees an empty page — a valid empty state, not an
 * error. Scope is forced to the caller's PG; no pgId is accepted from
 * input, so one tenant can never read another PG's announcements.
 */
export async function getTenantPgAnnouncements(
  userId: string,
  args: AnnouncementHistoryArgs
): Promise<AnnouncementPage> {
  const { limit, offset } = validatePage(args.limit, args.offset);

  const tenant = await tenantRepo().findOne({
    where: { user: { id: userId } },
    relations: { pg: true }
  });
  if (!tenant || !tenant.pg) {
    return { items: [], total: 0, limit, offset };
  }

  const queryBuilder = announcementRepo()
    .createQueryBuilder('announcement')
    .leftJoinAndSelect('announcement.pg', 'pg')
    .leftJoinAndSelect('announcement.createdBy', 'createdBy')
    .where('pg.id = :pgId', { pgId: tenant.pg.id })
    .orderBy('announcement.createdAt', 'DESC')
    .addOrderBy('announcement.id', 'DESC');

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}

/**
 * Searchable, paginated, filterable announcement list (admin-only at the
 * resolver). Search matches the PG name, the announcement title, and the
 * content case-insensitively. Filters: one PG. Newest announcements first
 * with a deterministic id tiebreak, mirroring the room/tenant/payment/
 * complaint lists (MRD §16: consistent pagination).
 */
export async function getAllAnnouncements(
  args: AnnouncementListArgs
): Promise<AnnouncementPage> {
  const { limit, offset } = validatePage(args.limit, args.offset);

  const queryBuilder = announcementRepo()
    .createQueryBuilder('announcement')
    .leftJoinAndSelect('announcement.pg', 'pg')
    .leftJoinAndSelect('announcement.createdBy', 'createdBy')
    .orderBy('announcement.createdAt', 'DESC')
    .addOrderBy('announcement.id', 'DESC');

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
      '(LOWER(pg.name) LIKE :term OR LOWER(announcement.title) LIKE :term OR LOWER(announcement.content) LIKE :term)',
      { term: `%${search.toLowerCase()}%` }
    );
  }

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}
