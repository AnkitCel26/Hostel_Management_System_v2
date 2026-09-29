/**
 * Phase 9 verification: exercises tenant document management through the real
 * GraphQL layer (same typeDefs/resolvers the Express app serves) —
 * authorization (tenant-only reads/writes, guests and admins guarded),
 * input validation (batch bounds, name/URL/number limits, URL format),
 * creation scoping (caller-derived tenant), partial updates, atomic batch
 * deletes, ownership boundaries between tenants, paginated tenant listing,
 * nested resolution, concurrent updates of one document, and a write-invariant
 * integrity sweep. Creates throwaway data and cleans up.
 *
 * Run: npx ts-node --transpile-only src/scripts/verifyPhase9.ts
 */
import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import type { Request, Response } from 'express';
import { GraphQLFormattedError } from 'graphql';
import { In } from 'typeorm';

import { AppDataSource } from '../config/db';
import { Pg } from '../entities/pg.entity';
import { Room } from '../entities/room.entity';
import { Tenant } from '../entities/tenant.entity';
import { TenantDocument } from '../entities/tenant_docs.entity';
import { User, UserRole } from '../entities/user.entity';
import { resolvers } from '../graphql/resolvers';
import { typeDefs } from '../graphql/typeDefs';
import type { AuthUser } from '../types';
import { hashPassword } from '../utils/password';

const TEST_ADMIN_EMAIL = 'phase9.admin@hostel.test';
const TEST_ADMIN_NAME = 'Phase Nine Admin';
const TEST_PASSWORD = 'phase9-verify-password';
const TEST_PG_NAMES = ['Phase9 Verify PG Alpha', 'Phase9 Verify PG Beta'];
const TENANT_EMAILS = [
  'phase9.rahul@hostel.test',
  'phase9.priya@hostel.test',
  'phase9.cross@hostel.test'
];
const ROOMLESS_EMAIL = 'phase9.roomless@hostel.test';
const TEST_USER_EMAILS = [TEST_ADMIN_EMAIL, ...TENANT_EMAILS, ROOMLESS_EMAIL];
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';
const STORAGE_BASE = 'https://phase9.supabase.co/storage/v1/object/public/tenant-documents';

interface GqlResult {
  data: Record<string, unknown> | null;
  errors?: readonly GraphQLFormattedError[];
}

interface PgShape {
  id: string;
  name: string;
}

interface RoomShape {
  id: string;
  roomNumber: string;
}

interface TenantShape {
  id: string;
  name: string;
}

interface DocumentShape {
  id: string;
  docName: string;
  docUrl: string;
  docNumber?: string | null;
  createdAt?: string;
  tenant?: { id: string; name: string };
}

interface DocumentPageShape {
  total: number;
  limit: number;
  offset: number;
  items: DocumentShape[];
}

const CREATE_PG = `
  mutation CreatePg($input: CreatePgInput!) {
    createPg(input: $input) { id name }
  }`;

const CREATE_ROOM = `
  mutation CreateRoom($input: CreateRoomInput!) {
    createRoom(input: $input) { id roomNumber }
  }`;

const CREATE_TENANT = `
  mutation CreateTenant($input: CreateTenantInput!) {
    createTenant(input: $input) { id name room { id roomNumber } }
  }`;

const UPLOAD_TENANT_DOCS = `
  mutation UploadTenantDocs($input: UploadTenantDocsInput!) {
    uploadTenantDocs(input: $input) {
      id docName docUrl docNumber
      tenant { id name }
    }
  }`;

const UPDATE_TENANT_DOCS = `
  mutation UpdateTenantDocs($id: ID!, $input: UpdateTenantDocsInput!) {
    updateTenantDocs(id: $id, input: $input) {
      id docName docUrl docNumber
      tenant { id name }
    }
  }`;

const DELETE_TENANT_DOCUMENTS = `
  mutation DeleteTenantDocuments($ids: [ID!]!) {
    deleteTenantDocuments(ids: $ids)
  }`;

const GET_TENANT_DOCUMENTS = `
  query GetTenantDocuments($limit: Int, $offset: Int) {
    getTenantDocuments(limit: $limit, offset: $offset) {
      total limit offset
      items { id docName docUrl docNumber createdAt tenant { id name } }
    }
  }`;

const GET_TENANTS_DOCUMENTS = `
  query GetAllTenantsDocuments($search: String) {
    getAllTenants(search: $search) {
      total
      items { id name documents { id docName docUrl } }
    }
  }`;

function check(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`FAIL ${label}: expected "${String(expected)}", got "${String(actual)}"`);
  }
  console.log(`PASS: ${label}`);
}

function field<T>(result: GqlResult, key: string): T {
  if (result.errors && result.errors.length > 0) {
    throw new Error(`FAIL unexpected GraphQL errors: ${result.errors[0].message}`);
  }
  const value = result.data?.[key];
  if (value === undefined || value === null) {
    throw new Error(`FAIL expected "${key}" in the response data`);
  }
  return value as T;
}

function expectError(label: string, result: GqlResult, code: string): void {
  const codes = (result.errors ?? []).map((error) => String(error.extensions?.code ?? 'UNKNOWN'));
  if (!codes.includes(code)) {
    throw new Error(
      `FAIL ${label}: expected error code "${code}", got [${codes.join(', ')}] ` +
      `(first message: ${result.errors?.[0]?.message ?? 'none'})`
    );
  }
  console.log(`PASS: ${label}`);
}

function storageUrl(path: string): string {
  return `${STORAGE_BASE}/${path}`;
}

/** Removes any data left over from a previous (or partial) run, in FK-safe order. */
async function cleanupTestData(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const pgRepo = AppDataSource.getRepository(Pg);
  const roomRepo = AppDataSource.getRepository(Room);
  const documentRepo = AppDataSource.getRepository(TenantDocument);

  const users = await userRepo.find({
    where: { email: In(TEST_USER_EMAILS) }
  });
  if (users.length > 0) {
    const tenants = await tenantRepo.find({
      where: users.map((user) => ({ user: { id: user.id } }))
    });
    if (tenants.length > 0) {
      // Documents reference the tenants — delete them before the tenants.
      await documentRepo
        .createQueryBuilder()
        .delete()
        .where('"tenantId" IN (:...tenantIds)', { tenantIds: tenants.map((tenant) => tenant.id) })
        .execute();
      await tenantRepo.delete(tenants.map((tenant) => tenant.id));
    }
    await userRepo.delete(users.map((user) => user.id));
  }

  const pgs = await pgRepo.find({ where: { name: In(TEST_PG_NAMES) } });
  if (pgs.length > 0) {
    const rooms = await roomRepo.find({
      where: pgs.map((pg) => ({ pg: { id: pg.id } }))
    });
    if (rooms.length > 0) {
      await roomRepo.delete(rooms.map((room) => room.id));
    }
    await pgRepo.delete(pgs.map((pg) => pg.id));
  }
}

async function main(): Promise<void> {
  await AppDataSource.initialize();

  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();

  const exec = async (
    query: string,
    variables: Record<string, unknown> = {},
    user?: AuthUser
  ): Promise<GqlResult> => {
    const contextValue = {
      req: { cookies: {} } as unknown as Request,
      res: {} as unknown as Response,
      user
    };
    const response = await server.executeOperation({ query, variables }, { contextValue });
    if (response.body.kind !== 'single') {
      throw new Error('Expected a single GraphQL result');
    }
    const single = response.body.singleResult;
    return { data: single.data ?? null, errors: single.errors };
  };

  try {
    await cleanupTestData();

    // --- throwaway users (auth flows are Phase 3 and already verified) ---
    const userRepo = AppDataSource.getRepository(User);
    const admin = await userRepo.save(
      userRepo.create({
        name: TEST_ADMIN_NAME,
        email: TEST_ADMIN_EMAIL,
        password: await hashPassword(TEST_PASSWORD),
        role: UserRole.Admin
      })
    );
    const asAdmin: AuthUser = { id: admin.id, role: 'Admin' };

    const createTestUser = async (name: string, email: string): Promise<User> =>
      userRepo.save(
        userRepo.create({
          name,
          email,
          password: await hashPassword(TEST_PASSWORD),
          role: UserRole.Tenant
        })
      );

    const [rahulUser, priyaUser, crossUser] = await Promise.all(
      TENANT_EMAILS.map((email, i) =>
        createTestUser(['Rahul Verma', 'Priya Sharma', 'Cross Pg Tenant'][i], email)
      )
    );
    const roomlessUser = await createTestUser('Roomless Tenant', ROOMLESS_EMAIL);
    const asTenant = (user: User): AuthUser => ({ id: user.id, role: 'Tenant' });

    // --- PGs, a room, and tenants (Phase 4/5 operations, already verified) ---
    const createPgViaGql = async (name: string): Promise<PgShape> =>
      field<PgShape>(
        await exec(CREATE_PG, { input: { name, address: `${name} address` } }, asAdmin),
        'createPg'
      );
    const alpha = await createPgViaGql(TEST_PG_NAMES[0]);
    const beta = await createPgViaGql(TEST_PG_NAMES[1]);

    const a101 = field<RoomShape>(
      await exec(
        CREATE_ROOM,
        { input: { pgId: alpha.id, roomNumber: 'A-101', capacity: 2, rent: 5000 } },
        asAdmin
      ),
      'createRoom'
    );

    const createTenantViaGql = async (
      userId: string,
      pgId: string,
      name: string,
      roomId?: string
    ): Promise<TenantShape> =>
      field<TenantShape>(
        await exec(
          CREATE_TENANT,
          { input: { userId, pgId, name, ...(roomId ? { roomId } : {}) } },
          asAdmin
        ),
        'createTenant'
      );
    const rahulTenant = await createTenantViaGql(rahulUser.id, alpha.id, 'Rahul Verma', a101.id);
    await createTenantViaGql(priyaUser.id, alpha.id, 'Priya Sharma');
    await createTenantViaGql(crossUser.id, beta.id, 'Cross Pg Tenant');

    const uploadDocs = async (
      docs: Record<string, unknown>[],
      user: AuthUser = asTenant(rahulUser)
    ): Promise<DocumentShape[]> =>
      field<DocumentShape[]>(
        await exec(UPLOAD_TENANT_DOCS, { input: { docs } }, user),
        'uploadTenantDocs'
      );

    const updateDoc = async (
      id: string,
      input: Record<string, unknown>,
      user: AuthUser = asTenant(rahulUser)
    ): Promise<DocumentShape> =>
      field<DocumentShape>(
        await exec(UPDATE_TENANT_DOCS, { id, input }, user),
        'updateTenantDocs'
      );

    const deleteDocs = async (
      ids: string[],
      user: AuthUser = asTenant(rahulUser)
    ): Promise<boolean> =>
      field<boolean>(await exec(DELETE_TENANT_DOCUMENTS, { ids }, user), 'deleteTenantDocuments');

    const listDocs = async (
      args: Record<string, unknown> = {},
      user: AuthUser = asTenant(rahulUser)
    ): Promise<DocumentPageShape> =>
      field<DocumentPageShape>(
        await exec(GET_TENANT_DOCUMENTS, args, user),
        'getTenantDocuments'
      );

    // --- authorization (FR-33: every operation is tenant-only) ---
    expectError('guest cannot list tenant documents', await exec(GET_TENANT_DOCUMENTS, {}), 'FORBIDDEN');
    expectError(
      'guest cannot upload documents',
      await exec(
        UPLOAD_TENANT_DOCS,
        { input: { docs: [{ docName: 'x', docUrl: storageUrl('guest.pdf') }] } }
      ),
      'FORBIDDEN'
    );
    expectError(
      'guest cannot update a document',
      await exec(UPDATE_TENANT_DOCS, { id: NONEXISTENT_ID, input: { docName: 'x' } }),
      'FORBIDDEN'
    );
    expectError(
      'guest cannot delete documents',
      await exec(DELETE_TENANT_DOCUMENTS, { ids: [NONEXISTENT_ID] }),
      'FORBIDDEN'
    );
    expectError(
      'admin cannot list tenant documents',
      await exec(GET_TENANT_DOCUMENTS, {}, asAdmin),
      'FORBIDDEN'
    );
    expectError(
      'admin cannot upload documents',
      await exec(
        UPLOAD_TENANT_DOCS,
        { input: { docs: [{ docName: 'x', docUrl: storageUrl('admin.pdf') }] } },
        asAdmin
      ),
      'FORBIDDEN'
    );
    expectError(
      'admin cannot update a document',
      await exec(UPDATE_TENANT_DOCS, { id: NONEXISTENT_ID, input: { docName: 'x' } }, asAdmin),
      'FORBIDDEN'
    );
    expectError(
      'admin cannot delete documents',
      await exec(DELETE_TENANT_DOCUMENTS, { ids: [NONEXISTENT_ID] }, asAdmin),
      'FORBIDDEN'
    );

    // --- uploadTenantDocs validation (FR-29) ---
    expectError(
      'uploadTenantDocs rejects an empty batch',
      await exec(UPLOAD_TENANT_DOCS, { input: { docs: [] } }, asTenant(rahulUser)),
      'BAD_USER_INPUT'
    );
    expectError(
      'uploadTenantDocs rejects a batch above the cap',
      await exec(
        UPLOAD_TENANT_DOCS,
        {
          input: {
            docs: Array.from({ length: 21 }, (_, i) => ({
              docName: `doc ${i}`,
              docUrl: storageUrl(`cap-${i}.pdf`)
            }))
          }
        },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'uploadTenantDocs rejects an empty docName',
      await exec(
        UPLOAD_TENANT_DOCS,
        { input: { docs: [{ docName: '', docUrl: storageUrl('a.pdf') }] } },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'uploadTenantDocs rejects a whitespace-only docName',
      await exec(
        UPLOAD_TENANT_DOCS,
        { input: { docs: [{ docName: '   ', docUrl: storageUrl('a.pdf') }] } },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'uploadTenantDocs rejects an over-long docName',
      await exec(
        UPLOAD_TENANT_DOCS,
        { input: { docs: [{ docName: 'x'.repeat(121), docUrl: storageUrl('a.pdf') }] } },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'uploadTenantDocs rejects an empty docUrl',
      await exec(
        UPLOAD_TENANT_DOCS,
        { input: { docs: [{ docName: 'Aadhaar card', docUrl: '' }] } },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'uploadTenantDocs rejects a non-URL docUrl',
      await exec(
        UPLOAD_TENANT_DOCS,
        { input: { docs: [{ docName: 'Aadhaar card', docUrl: 'not-a-url' }] } },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'uploadTenantDocs rejects a non-http protocol docUrl',
      await exec(
        UPLOAD_TENANT_DOCS,
        { input: { docs: [{ docName: 'Aadhaar card', docUrl: 'ftp://example.com/a.pdf' }] } },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'uploadTenantDocs rejects an over-long docUrl',
      await exec(
        UPLOAD_TENANT_DOCS,
        {
          input: {
            docs: [{ docName: 'Aadhaar card', docUrl: `https://example.com/${'x'.repeat(500)}.pdf` }]
          }
        },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'uploadTenantDocs rejects an over-long docNumber',
      await exec(
        UPLOAD_TENANT_DOCS,
        {
          input: {
            docs: [
              { docName: 'Aadhaar card', docUrl: storageUrl('a.pdf'), docNumber: 'x'.repeat(61) }
            ]
          }
        },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'a user without a tenant record cannot upload documents',
      await exec(
        UPLOAD_TENANT_DOCS,
        { input: { docs: [{ docName: 'x', docUrl: storageUrl('roomless.pdf') }] } },
        asTenant(roomlessUser)
      ),
      'BAD_USER_INPUT'
    );

    // --- uploadTenantDocs (FR-29): scoping, trimming, batch order ---
    const uploaded = await uploadDocs([
      {
        docName: '  Aadhaar card  ',
        docUrl: `  ${storageUrl(`${rahulUser.id}/aadhaar.pdf`)}  `,
        docNumber: '  UID-4321  '
      },
      { docName: 'Rent agreement', docUrl: storageUrl(`${rahulUser.id}/rent-agreement.pdf`) },
      { docName: 'Passport', docUrl: storageUrl(`${rahulUser.id}/passport.pdf`), docNumber: '' }
    ]);
    check('the upload returns every document in batch order', uploaded.length, 3);
    check('the upload trims the docName', uploaded[0].docName, 'Aadhaar card');
    check('the upload trims the docUrl', uploaded[0].docUrl, storageUrl(`${rahulUser.id}/aadhaar.pdf`));
    check('the upload trims the docNumber', uploaded[0].docNumber, 'UID-4321');
    check('a missing docNumber stays null', uploaded[1].docNumber, null);
    check('an empty docNumber stays null', uploaded[2].docNumber, null);
    check('the upload attaches the caller tenant', uploaded[0].tenant?.id, rahulTenant.id);
    check('the upload resolves the tenant name', uploaded[0].tenant?.name, 'Rahul Verma');

    const boundaryDoc = (
      await uploadDocs([
        { docName: 'y'.repeat(120), docUrl: `${storageUrl('max.pdf')}`.padEnd(500, 'x') }
      ])
    )[0];
    check('a 120-character docName is accepted', boundaryDoc.docName.length, 120);
    check('a 500-character docUrl is accepted', boundaryDoc.docUrl.length, 500);

    const priyaDoc = (
      await uploadDocs(
        [{ docName: 'Priya Aadhaar', docUrl: storageUrl(`${priyaUser.id}/aadhaar.pdf`) }],
        asTenant(priyaUser)
      )
    )[0];
    check("another tenant's upload attaches their own tenant", priyaDoc.tenant?.id !== rahulTenant.id, true);

    // --- getTenantDocuments: scoping, order, pagination (FR-28) ---
    const rahulList = await listDocs();
    check('the list counts the tenant documents', rahulList.total, 4);
    check('the list never leaks another tenant', rahulList.items.every((i) => i.tenant?.id === rahulTenant.id), true);
    check('the list defaults to limit 20', rahulList.limit, 20);

    const timestamps = rahulList.items.map((item) => item.createdAt);
    const ordered = timestamps.every((value, i) => {
      if (i === 0) return true;
      const previous = timestamps[i - 1];
      return value !== undefined && previous !== undefined && value <= previous;
    });
    if (!ordered) {
      throw new Error(
        `FAIL the document list is not ordered by newest first: ${JSON.stringify(timestamps)}`
      );
    }
    console.log('PASS: the document list is ordered by newest first');

    const priyaList = await listDocs({}, asTenant(priyaUser));
    check('another tenant sees only their own documents', priyaList.total, 1);
    check("the other tenant's list resolves their document", priyaList.items[0].docName, 'Priya Aadhaar');
    const crossList = await listDocs({}, asTenant(crossUser));
    check('a tenant with no documents gets an empty page', crossList.total, 0);
    const roomlessList = await listDocs({}, asTenant(roomlessUser));
    check('a user without a tenant record gets an empty page', roomlessList.total, 0);
    check('the empty document page has no items', roomlessList.items.length, 0);

    const pageOne = await listDocs({ limit: 2, offset: 0 });
    check('the list paginates items', pageOne.items.length, 2);
    check('the list reports the total across pages', pageOne.total, 4);
    check('the list echoes limit/offset', `${pageOne.limit}/${pageOne.offset}`, '2/0');
    const pageTail = await listDocs({ limit: 2, offset: 2 });
    check('the list returns the final partial page', pageTail.items.length, 2);
    const pageEnd = await listDocs({ limit: 2, offset: 4 });
    check('an offset past the end returns an empty page', pageEnd.items.length, 0);

    expectError(
      'the document list rejects limit 0',
      await exec(GET_TENANT_DOCUMENTS, { limit: 0 }, asTenant(rahulUser)),
      'BAD_USER_INPUT'
    );
    expectError(
      'the document list rejects limit above the max',
      await exec(GET_TENANT_DOCUMENTS, { limit: 101 }, asTenant(rahulUser)),
      'BAD_USER_INPUT'
    );
    expectError(
      'the document list rejects a negative offset',
      await exec(GET_TENANT_DOCUMENTS, { offset: -1 }, asTenant(rahulUser)),
      'BAD_USER_INPUT'
    );

    // --- updateTenantDocs validation (FR-29) ---
    const aadhaar = uploaded[0];
    expectError(
      'updateTenantDocs rejects an unknown id',
      await exec(UPDATE_TENANT_DOCS, { id: NONEXISTENT_ID, input: { docName: 'x' } }, asTenant(rahulUser)),
      'NOT_FOUND'
    );
    // A malformed id must be reported like any other unknown id, never as an
    // internal server error from the uuid column.
    expectError(
      'updateTenantDocs rejects a malformed id',
      await exec(UPDATE_TENANT_DOCS, { id: 'not-a-uuid', input: { docName: 'x' } }, asTenant(rahulUser)),
      'NOT_FOUND'
    );
    expectError(
      "one tenant cannot update another tenant's document",
      await exec(
        UPDATE_TENANT_DOCS,
        { id: aadhaar.id, input: { docName: 'hijacked' } },
        asTenant(priyaUser)
      ),
      'NOT_FOUND'
    );
    expectError(
      'updateTenantDocs rejects an empty docName',
      await exec(UPDATE_TENANT_DOCS, { id: aadhaar.id, input: { docName: '' } }, asTenant(rahulUser)),
      'BAD_USER_INPUT'
    );
    expectError(
      'updateTenantDocs rejects a non-URL docUrl',
      await exec(
        UPDATE_TENANT_DOCS,
        { id: aadhaar.id, input: { docUrl: 'not-a-url' } },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'updateTenantDocs rejects an over-long docNumber',
      await exec(
        UPDATE_TENANT_DOCS,
        { id: aadhaar.id, input: { docNumber: 'x'.repeat(61) } },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );

    // --- updateTenantDocs (FR-29): partial updates, clearing, ownership kept ---
    const renamed = await updateDoc(aadhaar.id, {
      docName: '  Aadhaar card (updated)  ',
      docNumber: 'UID-9999'
    });
    check('the docName update trims the value', renamed.docName, 'Aadhaar card (updated)');
    check('the docNumber update trims the value', renamed.docNumber, 'UID-9999');
    check('the update keeps the docUrl', renamed.docUrl, storageUrl(`${rahulUser.id}/aadhaar.pdf`));
    check('the update keeps the tenant', renamed.tenant?.id, rahulTenant.id);

    const cleared = await updateDoc(aadhaar.id, { docNumber: '' });
    check('an empty-string docNumber clears the value', cleared.docNumber, null);
    const noop = await updateDoc(aadhaar.id, {});
    check('an empty update keeps the docName', noop.docName, cleared.docName);
    check('an empty update keeps the docNumber', noop.docNumber, null);
    const renumbered = await updateDoc(aadhaar.id, { docNumber: null });
    check('an explicit null docNumber keeps the value null', renumbered.docNumber, null);
    const reattached = await updateDoc(aadhaar.id, {
      docUrl: `  ${storageUrl(`${rahulUser.id}/aadhaar-v2.pdf`)}  `
    });
    check('the docUrl update trims and replaces the value', reattached.docUrl, storageUrl(`${rahulUser.id}/aadhaar-v2.pdf`));

    // --- concurrent updates of one document serialize (row lock) ---
    // Two disjoint-field updates racing: both must land, with no lost update.
    const raced = uploaded[2];
    const [racedName, racedNumber] = await Promise.all([
      exec(UPDATE_TENANT_DOCS, { id: raced.id, input: { docName: 'raced passport' } }, asTenant(rahulUser)),
      exec(UPDATE_TENANT_DOCS, { id: raced.id, input: { docNumber: 'raced-number' } }, asTenant(rahulUser))
    ]);
    if (!racedName.data?.updateTenantDocs || !racedNumber.data?.updateTenantDocs) {
      throw new Error(
        `FAIL concurrent updates: one lost (${racedName.errors?.[0]?.message ?? 'ok'} / ${racedNumber.errors?.[0]?.message ?? 'ok'})`
      );
    }
    console.log('PASS: concurrent updates of one document both land');
    const racedList = await listDocs();
    const racedDoc = racedList.items.find((item) => item.id === raced.id);
    if (!racedDoc) throw new Error('The raced document was not found');
    check('the raced document kept the docName', racedDoc.docName, 'raced passport');
    check('the raced document kept the docNumber', racedDoc.docNumber, 'raced-number');

    // --- deleteTenantDocuments validation (FR-30) ---
    expectError(
      'deleteTenantDocuments rejects an empty id batch',
      await exec(DELETE_TENANT_DOCUMENTS, { ids: [] }, asTenant(rahulUser)),
      'BAD_USER_INPUT'
    );
    expectError(
      'deleteTenantDocuments rejects an unknown id',
      await exec(DELETE_TENANT_DOCUMENTS, { ids: [NONEXISTENT_ID] }, asTenant(rahulUser)),
      'NOT_FOUND'
    );
    expectError(
      'deleteTenantDocuments rejects a malformed id',
      await exec(DELETE_TENANT_DOCUMENTS, { ids: ['not-a-uuid'] }, asTenant(rahulUser)),
      'NOT_FOUND'
    );
    expectError(
      "one tenant cannot delete another tenant's document",
      await exec(DELETE_TENANT_DOCUMENTS, { ids: [aadhaar.id] }, asTenant(priyaUser)),
      'NOT_FOUND'
    );

    // A batch with one bad id deletes nothing (all-or-nothing).
    expectError(
      'a delete batch with one unknown id fails whole',
      await exec(
        DELETE_TENANT_DOCUMENTS,
        { ids: [aadhaar.id, NONEXISTENT_ID] },
        asTenant(rahulUser)
      ),
      'NOT_FOUND'
    );
    const afterFailedBatch = await listDocs();
    check('the failed batch deleted nothing', afterFailedBatch.total, 4);
    check('the failed batch kept the target document', afterFailedBatch.items.some((i) => i.id === aadhaar.id), true);

    expectError(
      'a delete batch with a foreign document fails whole',
      await exec(
        DELETE_TENANT_DOCUMENTS,
        { ids: [priyaDoc.id, aadhaar.id] },
        asTenant(rahulUser)
      ),
      'NOT_FOUND'
    );
    const priyaStillThere = await listDocs({}, asTenant(priyaUser));
    check("the foreign document survived the failed batch", priyaStillThere.total, 1);

    // --- deleteTenantDocuments (FR-30): single, duplicates, batch ---
    check('a single-document delete succeeds', await deleteDocs([aadhaar.id]), true);
    const afterSingle = await listDocs();
    check('the single delete removed the document', afterSingle.items.some((i) => i.id === aadhaar.id), false);
    check('the single delete kept the others', afterSingle.total, 3);

    expectError(
      'deleting an already-deleted document fails',
      await exec(DELETE_TENANT_DOCUMENTS, { ids: [aadhaar.id] }, asTenant(rahulUser)),
      'NOT_FOUND'
    );

    const agreement = uploaded[1];
    check('a duplicate-id delete batch succeeds', await deleteDocs([agreement.id, agreement.id]), true);
    const afterDuplicates = await listDocs();
    check('the duplicate-id batch deleted the document once', afterDuplicates.total, 2);

    check('a batch delete removes every id', await deleteDocs([raced.id, boundaryDoc.id]), true);
    const afterBatch = await listDocs();
    check('the batch delete emptied the tenant documents', afterBatch.total, 0);

    check("a tenant deletes their own document", await deleteDocs([priyaDoc.id], asTenant(priyaUser)), true);

    // --- nested resolution through the relation field resolvers ---
    await uploadDocs([
      { docName: 'Nested Aadhaar', docUrl: storageUrl(`${rahulUser.id}/nested-aadhaar.pdf`), docNumber: 'NEST-1' }
    ]);
    const deepList = field<DocumentPageShape>(
      await exec(GET_TENANT_DOCUMENTS, {}, asTenant(rahulUser)),
      'getTenantDocuments'
    );
    const deepDoc = deepList.items[0];
    if (!deepDoc) throw new Error('The deep document query returned no items');
    check('the document resolves its tenant', deepDoc.tenant?.name, 'Rahul Verma');

    const tenantsPage = field<{
      total: number;
      items: Array<TenantShape & { documents: DocumentShape[] }>;
    }>(
      await exec(GET_TENANTS_DOCUMENTS, { search: 'Rahul Verma' }, asAdmin),
      'getAllTenants'
    );
    const rahulRow = tenantsPage.items.find((t) => t.name === 'Rahul Verma');
    if (!rahulRow) throw new Error('The admin tenant list did not return Rahul');
    check('Tenant.documents resolves through the admin list', rahulRow.documents.length, 1);
    check('the nested document carries its docName', rahulRow.documents[0].docName, 'Nested Aadhaar');

    // --- write-invariant integrity sweep ---
    const documentRepo = AppDataSource.getRepository(TenantDocument);
    const testDocuments = await documentRepo
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.tenant', 'tenant')
      .leftJoinAndSelect('tenant.user', 'user')
      .where('user.email IN (:...emails)', { emails: TEST_USER_EMAILS })
      .getMany();
    if (testDocuments.length !== 1) {
      throw new Error(`Expected 1 remaining test document for the sweep, found ${testDocuments.length}`);
    }
    for (const document of testDocuments) {
      if (document.docName.length === 0 || document.docName.length > 120) {
        throw new Error(`FAIL integrity: document ${document.id} has an invalid docName length`);
      }
      const url = new URL(document.docUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error(`FAIL integrity: document ${document.id} has a non-http(s) URL`);
      }
      if (document.tenant.id !== rahulTenant.id) {
        throw new Error(`FAIL integrity: document ${document.id} points at a foreign tenant`);
      }
      if (document.docNumber != null && document.docNumber.length > 60) {
        throw new Error(`FAIL integrity: document ${document.id} has an invalid docNumber length`);
      }
    }
    console.log('PASS: every document satisfies the scoping invariant');

    console.log('\nAll Phase 9 tenant document management checks passed.');
  } finally {
    await cleanupTestData();
    await server.stop();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Phase 9 verification FAILED:', error);
  process.exit(1);
});
