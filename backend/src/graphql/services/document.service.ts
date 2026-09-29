import { GraphQLError } from 'graphql';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/db';
import { Tenant } from '../../entities/tenant.entity';
import { TenantDocument } from '../../entities/tenant_docs.entity';

/**
 * Tenant document management (Phase 9): document metadata/URL persistence and
 * tenant-scoped retrieval (FR-28 through FR-30).
 *
 * Storage split (MRD §16): the actual file lives in Supabase storage; the
 * database keeps only the metadata and the stored document URL. The client
 * uploads the file to storage and then records the resulting URL through
 * these operations. Deleting a record never touches the storage object —
 * the client removes the storage file alongside the record deletion.
 *
 * Role boundaries (mirroring the complaint/announcement services):
 * - Every operation here is tenant-only and scoped to the CALLER's own
 *   tenant record — no tenantId is accepted from input, so one tenant can
 *   never read, change, or delete another tenant's documents.
 * - A Tenant-role user without a tenant record cannot upload documents
 *   (documents attach to a tenant record); listing returns a valid empty
 *   page instead of an error.
 * - Ownership failures on update/delete are reported as NOT_FOUND, so a
 *   foreign document's existence is never leaked.
 *
 * uploadTenantDocs and deleteTenantDocuments are batch operations and run
 * inside a single transaction (all-or-nothing). updateTenantDocs row-locks
 * the document (SELECT ... FOR UPDATE, the same pessimistic-lock pattern as
 * Phases 5 through 8), so concurrent updates of one document serialize
 * instead of losing updates.
 */

/** One document in an uploadTenantDocs batch. */
export interface UploadTenantDocInput {
  docName: string;
  docUrl: string;
  docNumber?: string | null;
}

/** uploadTenantDocs input: a non-empty batch of documents. */
export interface UploadTenantDocsInput {
  docs: UploadTenantDocInput[];
}

/**
 * Partial update semantics (same as the PG/room/tenant/payment/complaint/
 * announcement services): undefined and null leave a field unchanged. An
 * empty string clears the optional docNumber; docName and docUrl are
 * required fields and reject empty values.
 */
export interface UpdateTenantDocsInput {
  docName?: string | null;
  docUrl?: string | null;
  docNumber?: string | null;
}

/** Query args for the tenant-facing document list (pagination only). */
export interface DocumentListArgs {
  limit?: number | null;
  offset?: number | null;
}

/** Result shape for the paginated document list (mirrors RoomPage, MRD §16). */
export interface TenantDocumentPage {
  items: TenantDocument[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_BATCH_SIZE = 20;
const DOC_NAME_MAX = 120; // must match the tenant_documents.docName column (varchar 120)
const DOC_URL_MAX = 500; // must match the tenant_documents.docUrl column (varchar 500)
const DOC_NUMBER_MAX = 60; // must match the tenant_documents.docNumber column (varchar 60)

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

/**
 * The stored document URL: required, within the column limit, and an
 * absolute http(s) URL. Anything else is rejected before the write, so a
 * broken URL can never be persisted.
 */
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

/**
 * The optional document reference number: absent/null/empty clears it,
 * otherwise trimmed and within the column limit.
 */
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

/** Pagination bounds for the document list (MRD §16). */
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
 * reported with the same NOT_FOUND answer as a well-formed id that does not
 * exist. Without this guard the uuid column error would surface as an
 * internal server error.
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** The caller's own tenant record (documents attach to a tenant record). */
async function findOwnTenant(userId: string): Promise<Tenant | null> {
  return tenantRepo().findOne({ where: { user: { id: userId } } });
}

/**
 * Locks the document row (SELECT ... FOR UPDATE) and loads it with its
 * tenant and the tenant's user, ready for the ownership check. Concurrent
 * updates/deletes of the same document serialize here. Only the document
 * row is locked — the tenant and user are read-only reference data for the
 * operation.
 */
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

/** Throws NOT_FOUND unless the locked document belongs to the caller. */
function assertOwnership(document: TenantDocument, userId: string): void {
  if (!document.tenant || document.tenant.user?.id !== userId) {
    // Same answer for a foreign document and a deleted one — never leak
    // another tenant's document existence.
    throw notFound('Document not found');
  }
}

/** Deduplicates an id batch while keeping the caller's order. */
function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Records uploaded document metadata/URLs (FR-29, upload half). The caller
 * is a Tenant-role user; every document attaches to their own tenant
 * record. The batch runs in one transaction — either every document is
 * recorded or none is.
 */
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

  // Scalar validation runs before any database work (fail fast, no locks yet).
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
    // create()/save() may return relation clones of the input literal, so
    // re-attach the live entity (same convention as Phases 5 through 8),
    // keeping the caller's batch order.
    return saved.map((row) => {
      row.tenant = tenant;
      return row;
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      // The tenant record was deleted between the check and the insert.
      throw badRequest('The documents could not be recorded because the tenant assignment changed');
    }
    throw error;
  }
}

/**
 * Updates one of the caller's own documents (FR-29, update half). Fields
 * follow partial-update semantics. Runs under a row lock so concurrent
 * updates of one document cannot interleave.
 */
export async function updateTenantDocs(
  userId: string,
  id: string,
  input: UpdateTenantDocsInput
): Promise<TenantDocument> {
  // Scalar validation runs before the transaction (fail fast, no locks yet).
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
    // Re-attach the live relation in case save() returned a relation clone.
    saved.tenant = document.tenant;
    return saved;
  });
}

/**
 * Deletes the caller's own documents (FR-30). The batch runs in one
 * transaction and is all-or-nothing: every id must exist and belong to the
 * caller, otherwise nothing is deleted. Storage files are not touched —
 * the client removes them alongside this call.
 */
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
    // Lock + verify every row first: a single unknown or foreign id fails
    // the whole batch before anything is deleted.
    for (const id of unique) {
      const document = await lockDocument(manager, id);
      assertOwnership(document, userId);
    }
    await manager.getRepository(TenantDocument).delete(unique);
    return true;
  });
}

/**
 * The tenant-facing document list (FR-28): the current user's own
 * documents, newest first. A Tenant-role user without a tenant record (no
 * assignment yet) sees an empty page — a valid empty state, not an error.
 * Scope is forced to the caller's tenant record; no tenantId is accepted
 * from input, so one tenant can never read another tenant's documents.
 */
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
