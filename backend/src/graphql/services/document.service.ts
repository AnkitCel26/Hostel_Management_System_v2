import { GraphQLError } from 'graphql';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/db';
import { Tenant } from '../../entities/tenant.entity';
import { TenantDocument } from '../../entities/tenant_docs.entity';

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

export interface DocumentListArgs {
  limit?: number | null;
  offset?: number | null;
}

export interface TenantDocumentPage {
  items: TenantDocument[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_BATCH_SIZE = 20;
const DOC_NAME_MAX = 120;
const DOC_URL_MAX = 500;
const DOC_NUMBER_MAX = 60;

function documentRepo() {
  return AppDataSource.getRepository(TenantDocument);
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

function validateDocUrl(raw: string | null | undefined): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) {
    throw badRequest('Document URL is required and cannot be empty');
  }
  if (trimmed.length > DOC_URL_MAX) {
    throw badRequest(`Document URL must be ${DOC_URL_MAX} characters or fewer`);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw badRequest('Document URL must be a valid absolute http(s) URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw badRequest('Document URL must be a valid absolute http(s) URL');
  }
  return trimmed;
}

function validateDocNumber(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > DOC_NUMBER_MAX) {
    throw badRequest(`Document number must be ${DOC_NUMBER_MAX} characters or fewer`);
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

async function findOwnTenant(userId: string): Promise<Tenant | null> {
  return tenantRepo().findOne({ where: { user: { id: userId } } });
}

async function lockDocument(
  manager: EntityManager,
  id: string
): Promise<TenantDocument> {
  if (!isUuid(id)) {
    throw notFound('Document not found');
  }
  const document = await manager
    .getRepository(TenantDocument)
    .createQueryBuilder('document')
    .leftJoinAndSelect('document.tenant', 'tenant')
    .leftJoinAndSelect('tenant.user', 'user')
    .setLock('pessimistic_write', undefined, ['document'])
    .where('document.id = :id', { id })
    .getOne();
  if (!document) {
    throw notFound('Document not found');
  }
  return document;
}

function assertOwnership(document: TenantDocument, userId: string): void {
  if (!document.tenant || document.tenant.user?.id !== userId) {
    // Same answer for a foreign document and a deleted one — never leak
    // another tenant's document existence.
    throw notFound('Document not found');
  }
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export async function uploadTenantDocs(
  userId: string,
  input: UploadTenantDocsInput
): Promise<TenantDocument[]> {
  const docs = Array.isArray(input.docs) ? input.docs : [];
  if (docs.length === 0) {
    throw badRequest('At least one document is required');
  }
  if (docs.length > MAX_BATCH_SIZE) {
    throw badRequest(`A document batch must contain ${MAX_BATCH_SIZE} documents or fewer`);
  }

  const validated = docs.map((doc) => ({
    docName: requiredText(doc.docName, DOC_NAME_MAX, 'Document name'),
    docUrl: validateDocUrl(doc.docUrl),
    docNumber: validateDocNumber(doc.docNumber)
  }));

  const tenant = await findOwnTenant(userId);
  if (!tenant) {
    throw badRequest(
      'Documents can only be uploaded by a tenant with a tenant record — contact the admin to be assigned first'
    );
  }

  try {
    const saved = await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TenantDocument);
      const rows = validated.map((doc) => repo.create({ tenant, ...doc }));
      return repo.save(rows);
    });
    return saved.map((row) => {
      row.tenant = tenant;
      return row;
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw badRequest('The documents could not be recorded because the tenant assignment changed');
    }
    throw error;
  }
}

export async function updateTenantDocs(
  userId: string,
  id: string,
  input: UpdateTenantDocsInput
): Promise<TenantDocument> {
  const docName =
    input.docName !== undefined && input.docName !== null
      ? requiredText(input.docName, DOC_NAME_MAX, 'Document name')
      : undefined;
  const docUrl =
    input.docUrl !== undefined && input.docUrl !== null
      ? validateDocUrl(input.docUrl)
      : undefined;
  const docNumber =
    input.docNumber === undefined ? undefined : validateDocNumber(input.docNumber);

  return AppDataSource.transaction(async (manager) => {
    const document = await lockDocument(manager, id);
    assertOwnership(document, userId);

    if (docName !== undefined) {
      document.docName = docName;
    }
    if (docUrl !== undefined) {
      document.docUrl = docUrl;
    }
    if (docNumber !== undefined) {
      document.docNumber = docNumber;
    }

    const saved = await manager.getRepository(TenantDocument).save(document);
    saved.tenant = document.tenant;
    return saved;
  });
}

export async function deleteTenantDocuments(
  userId: string,
  ids: string[]
): Promise<boolean> {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw badRequest('At least one document id is required');
  }
  const unique = uniqueIds(ids);
  if (unique.length > MAX_BATCH_SIZE) {
    throw badRequest(`A document batch must contain ${MAX_BATCH_SIZE} documents or fewer`);
  }

  return AppDataSource.transaction(async (manager) => {
    for (const id of unique) {
      const document = await lockDocument(manager, id);
      assertOwnership(document, userId);
    }
    await manager.getRepository(TenantDocument).delete(unique);
    return true;
  });
}

export async function getTenantDocuments(
  userId: string,
  args: DocumentListArgs
): Promise<TenantDocumentPage> {
  const { limit, offset } = validatePage(args.limit, args.offset);

  const tenant = await findOwnTenant(userId);
  if (!tenant) {
    return { items: [], total: 0, limit, offset };
  }

  const queryBuilder = documentRepo()
    .createQueryBuilder('document')
    .leftJoinAndSelect('document.tenant', 'tenant')
    .where('tenant.id = :tenantId', { tenantId: tenant.id })
    .orderBy('document.createdAt', 'DESC')
    .addOrderBy('document.id', 'DESC');

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}
