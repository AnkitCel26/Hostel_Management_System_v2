import { GraphQLError } from 'graphql';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/db';
import { Announcement } from '../../entities/announcement.entity';
import { Pg } from '../../entities/pg.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';

/** createAnnouncement input. createdBy is system-derived from the caller. */
export interface CreateAnnouncementInput {
  pgId: string;
  title: string;
  content: string;
}

export interface UpdateAnnouncementInput {
  title?: string | null;
  content?: string | null;
}

export interface AnnouncementListArgs {
  search?: string | null;
  pgId?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface AnnouncementHistoryArgs {
  limit?: number | null;
  offset?: number | null;
}

export interface AnnouncementPage {
  items: Announcement[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const TITLE_MAX = 160;
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    saved.pg = pg;
    saved.createdBy = createdBy;
    return saved;
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw badRequest('The announcement could not be created because the PG no longer exists');
    }
    throw error;
  }
}

export async function updateAnnouncement(
  id: string,
  input: UpdateAnnouncementInput
): Promise<Announcement> {
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
    saved.pg = announcement.pg;
    saved.createdBy = announcement.createdBy;
    return saved;
  });
}

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
