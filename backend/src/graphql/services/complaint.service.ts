import { GraphQLError } from 'graphql';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/db';
import { Complaint, ComplaintStatus } from '../../entities/complaint.entity';
import { Pg } from '../../entities/pg.entity';
import { Tenant } from '../../entities/tenant.entity';

export interface CreateComplaintInput {
  title: string;
  description: string;
}

export interface UpdateComplaintInput {
  title?: string | null;
  description?: string | null;
  status?: ComplaintStatus | null;
}

export interface ComplaintListArgs {
  search?: string | null;
  pgId?: string | null;
  tenantId?: string | null;
  status?: ComplaintStatus | null;
  limit?: number | null;
  offset?: number | null;
}

export interface ComplaintHistoryArgs {
  limit?: number | null;
  offset?: number | null;
}

export interface ComplaintPage {
  items: Complaint[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const TITLE_MAX = 160;
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

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23503'
  );
}

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function validateComplaintStatus(raw: unknown): ComplaintStatus | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string' || !STATUS_VALUES.has(raw)) {
    throw badRequest('Status must be one of: open, in_progress, resolved');
  }
  return raw as ComplaintStatus;
}

function resolveResolvedAt(
  status: ComplaintStatus,
  previous: Date | null | undefined
): Date | null {
  return status === ComplaintStatus.Resolved ? (previous ?? new Date()) : null;
}

async function findOwnTenantWithPg(userId: string): Promise<Tenant | null> {
  return tenantRepo().findOne({
    where: { user: { id: userId } },
    relations: { pg: true }
  });
}

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
    saved.tenant = tenant;
    saved.pg = tenant.pg;
    return saved;
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw badRequest('The complaint could not be filed because the tenant assignment changed');
    }
    throw error;
  }
}

export async function updateComplaint(
  id: string,
  input: UpdateComplaintInput
): Promise<Complaint> {
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
    saved.tenant = complaint.tenant;
    saved.pg = complaint.pg;
    return saved;
  });
}

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
