import { GraphQLError } from 'graphql';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/db';
import { Complaint, ComplaintStatus } from '../../entities/complaint.entity';
import { Pg } from '../../entities/pg.entity';
import { Tenant } from '../../entities/tenant.entity';

/**
 * Complaint management (Phase 7): complaint creation, tenant-scoped and
 * admin retrieval, and admin updates (FR-22 through FR-24).
 *
 * Role boundaries (mirroring the payment service):
 * - createComplaint is called by a Tenant-role user, and the complaint is
 *   always scoped to the CALLER's own tenant record and that record's PG —
 *   no tenantId or pgId is accepted from input, so a tenant can never file
 *   a complaint against another tenant's PG.
 * - A Tenant-role user without a tenant record (no PG assignment yet)
 *   cannot file a complaint: a complaint belongs to a tenant and a PG, and
 *   neither exists without the assignment.
 * - updateComplaint is admin-only; the tenant-visible surface is read-only.
 *
 * resolvedAt is system-managed alongside the status, in one pure derivation
 * (the same pattern as the payment status/paidDate pair):
 *
 *   status = resolved -> resolvedAt = existing resolvedAt ?? now
 *   status != resolved -> resolvedAt = null
 *
 * The rule runs on every write, so the stored pair can never disagree: a
 * resolved complaint always carries a resolution timestamp, and reopening
 * it always clears that timestamp.
 *
 * Updates run inside a transaction that row-locks the complaint (the same
 * pessimistic-lock pattern as Phases 5/6), so concurrent read-modify-write
 * updates of one complaint serialize instead of losing updates.
 */

/** createComplaint input. Only title and description are accepted — the
 * tenant, PG, status, and resolvedAt are all system-derived. */
export interface CreateComplaintInput {
  title: string;
  description: string;
}

/**
 * Partial update semantics (same as the PG/room/tenant/payment services):
 * undefined and null leave a field unchanged. resolvedAt is never taken from
 * input — it is re-derived from the status on every write.
 */
export interface UpdateComplaintInput {
  title?: string | null;
  description?: string | null;
  status?: ComplaintStatus | null;
}

/** Query args for the paginated, filterable admin complaint list. */
export interface ComplaintListArgs {
  search?: string | null;
  pgId?: string | null;
  tenantId?: string | null;
  status?: ComplaintStatus | null;
  limit?: number | null;
  offset?: number | null;
}

/** Query args for the tenant-facing complaint list (pagination only). */
export interface ComplaintHistoryArgs {
  limit?: number | null;
  offset?: number | null;
}

/** Result shape for the paginated complaint collections (mirrors RoomPage, MRD §16). */
export interface ComplaintPage {
  items: Complaint[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const TITLE_MAX = 160; // must match the complaints.title column (varchar 160)
const DESCRIPTION_MAX = 5000;

function complaintRepo() {
  return AppDataSource.getRepository(Complaint);
}

function tenantRepo() {
  return AppDataSource.getRepository(Tenant);
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

/** Pagination bounds shared by both complaint lists (MRD §16). */
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

const STATUS_VALUES = new Set<string>(Object.values(ComplaintStatus));

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

/** Backstop for non-GraphQL callers: the status filter/value must be a real enum value. */
function validateComplaintStatus(raw: unknown): ComplaintStatus | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string' || !STATUS_VALUES.has(raw)) {
    throw badRequest('Status must be one of: open, in_progress, resolved');
  }
  return raw as ComplaintStatus;
}

/** The resolvedAt a write must persist for the given status (see the file header). */
function resolveResolvedAt(
  status: ComplaintStatus,
  previous: Date | null | undefined
): Date | null {
  return status === ComplaintStatus.Resolved ? (previous ?? new Date()) : null;
}

/** The caller's own tenant record with its PG (complaints are filed by tenants). */
async function findOwnTenantWithPg(userId: string): Promise<Tenant | null> {
  return tenantRepo().findOne({
    where: { user: { id: userId } },
    relations: { pg: true }
  });
}

/**
 * Locks the complaint row (SELECT ... FOR UPDATE) and loads it with its
 * tenant and PG. Concurrent updates of the same complaint serialize here,
 * so the read-modify-write status/resolvedAt derivation can never interleave
 * or lose updates. Only the complaint row is locked — the tenant and PG are
 * read-only reference data for this operation.
 */
async function lockComplaint(manager: EntityManager, id: string): Promise<Complaint> {
  if (!isUuid(id)) {
    throw notFound('Complaint not found');
  }
  const complaint = await manager
    .getRepository(Complaint)
    .createQueryBuilder('complaint')
    .leftJoinAndSelect('complaint.tenant', 'tenant')
    .leftJoinAndSelect('complaint.pg', 'pg')
    .setLock('pessimistic_write', undefined, ['complaint'])
    .where('complaint.id = :id', { id })
    .getOne();
  if (!complaint) {
    throw notFound('Complaint not found');
  }
  return complaint;
}

/**
 * Creates a complaint (FR-22). The caller is a Tenant-role user; the
 * complaint is attached to their own tenant record and that record's PG.
 * The status always starts open and resolvedAt starts null.
 */
export async function createComplaint(
  userId: string,
  input: CreateComplaintInput
): Promise<Complaint> {
  const title = requiredText(input.title, TITLE_MAX, 'Title');
  const description = requiredText(input.description, DESCRIPTION_MAX, 'Description');

  const tenant = await findOwnTenantWithPg(userId);
  if (!tenant) {
    throw badRequest(
      'A complaint can only be filed by a tenant with a PG assignment — contact the admin to be assigned first'
    );
  }
  if (!tenant.pg) {
    // Unreachable while the FK stays NOT NULL, but kept as a hard guard.
    throw badRequest('The tenant record has no PG assignment');
  }

  const complaint = complaintRepo().create({
    tenant,
    pg: tenant.pg,
    title,
    description,
    status: ComplaintStatus.Open,
    resolvedAt: null
  });

  try {
    const saved = await complaintRepo().save(complaint);
    // create()/save() may return relation clones of the input literal, so
    // re-attach the live entities (same convention as Phases 5/6).
    saved.tenant = tenant;
    saved.pg = tenant.pg;
    return saved;
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      // The tenant or PG was deleted between the check and the insert.
      throw badRequest('The complaint could not be filed because the tenant assignment changed');
    }
    throw error;
  }
}

/**
 * Updates a complaint (FR-24, admin-only at the resolver). Title and
 * description follow partial-update semantics; resolvedAt is always
 * re-derived from the status. Runs under a row lock so concurrent updates
 * of one complaint cannot interleave.
 */
export async function updateComplaint(
  id: string,
  input: UpdateComplaintInput
): Promise<Complaint> {
  // Scalar validation runs before the transaction (fail fast, no locks yet).
  const title =
    input.title !== undefined && input.title !== null
      ? requiredText(input.title, TITLE_MAX, 'Title')
      : undefined;
  const description =
    input.description !== undefined && input.description !== null
      ? requiredText(input.description, DESCRIPTION_MAX, 'Description')
      : undefined;
  const status = validateComplaintStatus(input.status);

  return AppDataSource.transaction(async (manager) => {
    const complaint = await lockComplaint(manager, id);

    if (title !== undefined) {
      complaint.title = title;
    }
    if (description !== undefined) {
      complaint.description = description;
    }
    const nextStatus = status ?? complaint.status;
    complaint.status = nextStatus;
    complaint.resolvedAt = resolveResolvedAt(nextStatus, complaint.resolvedAt);

    const saved = await manager.getRepository(Complaint).save(complaint);
    // Re-attach the live relations in case save() returned a relation clone.
    saved.tenant = complaint.tenant;
    saved.pg = complaint.pg;
    return saved;
  });
}

/**
 * The tenant-facing complaint list (FR-23): the current user's own
 * complaints, newest first. A Tenant-role user without a tenant record (no
 * assignment yet) sees an empty page — a valid empty state, not an error.
 * Scope is forced to the caller's tenant record; no tenantId is accepted
 * from input, so one tenant can never read another tenant's complaints.
 */
export async function getTenantComplaints(
  userId: string,
  args: ComplaintHistoryArgs
): Promise<ComplaintPage> {
  const { limit, offset } = validatePage(args.limit, args.offset);

  const tenant = await tenantRepo().findOne({ where: { user: { id: userId } } });
  if (!tenant) {
    return { items: [], total: 0, limit, offset };
  }

  const queryBuilder = complaintRepo()
    .createQueryBuilder('complaint')
    .leftJoinAndSelect('complaint.tenant', 'tenant')
    .leftJoinAndSelect('complaint.pg', 'pg')
    .where('tenant.id = :tenantId', { tenantId: tenant.id })
    .orderBy('complaint.createdAt', 'DESC')
    .addOrderBy('complaint.id', 'DESC');

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}

/**
 * Searchable, paginated, filterable complaint list (FR-23, admin-only at the
 * resolver). Search matches the tenant name, the linked user's email, the
 * tenant's room number, the PG name, the complaint title, and the
 * description case-insensitively. Filters: one PG, one tenant, one status.
 * Newest complaints first with a deterministic id tiebreak, mirroring the
 * room/tenant/payment lists (MRD §16: consistent pagination).
 */
export async function getAllComplaints(args: ComplaintListArgs): Promise<ComplaintPage> {
  const { limit, offset } = validatePage(args.limit, args.offset);
  const status = validateComplaintStatus(args.status);

  const queryBuilder = complaintRepo()
    .createQueryBuilder('complaint')
    .leftJoinAndSelect('complaint.tenant', 'tenant')
    .leftJoinAndSelect('tenant.user', 'user')
    .leftJoinAndSelect('complaint.pg', 'pg')
    .leftJoinAndSelect('tenant.room', 'room')
    .orderBy('complaint.createdAt', 'DESC')
    .addOrderBy('complaint.id', 'DESC');

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

  const tenantId = typeof args.tenantId === 'string' ? args.tenantId.trim() : '';
  if (tenantId.length > 0) {
    if (!isUuid(tenantId)) {
      throw badRequest('The selected tenant does not exist');
    }
    const tenant = await tenantRepo().findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw badRequest('The selected tenant does not exist');
    }
    queryBuilder.andWhere('tenant.id = :tenantId', { tenantId: tenant.id });
  }

  if (status !== null) {
    // Stored status: complaint statuses only change through writes, so a
    // plain column comparison is exact (unlike the live payment status).
    queryBuilder.andWhere('complaint.status = :status', { status });
  }

  const search = typeof args.search === 'string' ? args.search.trim() : '';
  if (search.length > 0) {
    queryBuilder.andWhere(
      '(LOWER(tenant.name) LIKE :term OR LOWER(user.email) LIKE :term OR LOWER(room.roomNumber) LIKE :term OR LOWER(pg.name) LIKE :term OR LOWER(complaint.title) LIKE :term OR LOWER(complaint.description) LIKE :term)',
      { term: `%${search.toLowerCase()}%` }
    );
  }

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}
