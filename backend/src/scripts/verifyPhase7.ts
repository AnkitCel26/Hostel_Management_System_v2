/**
 * Phase 7 verification: exercises complaint management through the real
 * GraphQL layer (same typeDefs/resolvers the Express app serves) —
 * authorization (tenant files, admin updates, both roles guarded), input
 * validation, status/resolvedAt derivation (system-managed resolvedAt set
 * on resolved, cleared on reopen), searchable/filterable/paginated admin
 * listing, tenant-scoped listing, nested resolution, concurrent updates of
 * one complaint, and a write-invariant integrity sweep. Creates throwaway
 * data and cleans up.
 *
 * Run: npx ts-node --transpile-only src/scripts/verifyPhase7.ts
 */
import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import type { Request, Response } from 'express';
import { GraphQLFormattedError } from 'graphql';
import { In } from 'typeorm';

import { AppDataSource } from '../config/db';
import { Complaint, ComplaintStatus } from '../entities/complaint.entity';
import { Pg } from '../entities/pg.entity';
import { Room } from '../entities/room.entity';
import { Tenant } from '../entities/tenant.entity';
import { User, UserRole } from '../entities/user.entity';
import { resolvers } from '../graphql/resolvers';
import { typeDefs } from '../graphql/typeDefs';
import type { AuthUser } from '../types';
import { hashPassword } from '../utils/password';

const TEST_ADMIN_EMAIL = 'phase7.admin@hostel.test';
const TEST_PASSWORD = 'phase7-verify-password';
const TEST_PG_NAMES = ['Phase7 Verify PG Alpha', 'Phase7 Verify PG Beta'];
const TENANT_EMAILS = [
  'phase7.rahul@hostel.test',
  'phase7.priya@hostel.test',
  'phase7.cross@hostel.test'
];
const ROOMLESS_EMAIL = 'phase7.roomless@hostel.test';
const TEST_USER_EMAILS = [TEST_ADMIN_EMAIL, ...TENANT_EMAILS, ROOMLESS_EMAIL];
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

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

interface ComplaintShape {
  id: string;
  title: string;
  description: string;
  status: string;
  resolvedAt?: string | null;
  createdAt?: string;
  tenant?: { id: string; name: string };
  pg?: { id: string; name: string };
}

interface ComplaintPageShape {
  total: number;
  limit: number;
  offset: number;
  items: ComplaintShape[];
}

interface DeepComplaintShape {
  id: string;
  tenant: {
    id: string;
    name: string;
    user: { email: string };
    pg: { id: string; name: string };
    room: { roomNumber: string } | null;
  };
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

const CREATE_COMPLAINT = `
  mutation CreateComplaint($input: CreateComplaintInput!) {
    createComplaint(input: $input) {
      id title description status resolvedAt
      tenant { id name }
      pg { id name }
    }
  }`;

const UPDATE_COMPLAINT = `
  mutation UpdateComplaint($id: ID!, $input: UpdateComplaintInput!) {
    updateComplaint(id: $id, input: $input) {
      id title description status resolvedAt
      tenant { id name user { email } }
    }
  }`;

const GET_COMPLAINTS = `
  query GetAllComplaints($search: String, $pgId: ID, $tenantId: ID, $status: ComplaintStatus, $limit: Int, $offset: Int) {
    getAllComplaints(search: $search, pgId: $pgId, tenantId: $tenantId, status: $status, limit: $limit, offset: $offset) {
      total limit offset
      items { id title description status resolvedAt createdAt tenant { id name } }
    }
  }`;

const GET_COMPLAINTS_DEEP = `
  query GetAllComplaintsDeep($search: String) {
    getAllComplaints(search: $search) {
      items {
        id
        tenant {
          id name
          user { email }
          pg { id name }
          room { roomNumber }
        }
      }
    }
  }`;

const GET_TENANT_COMPLAINTS = `
  query GetTenantComplaints($limit: Int, $offset: Int) {
    getTenantComplaints(limit: $limit, offset: $offset) {
      total limit offset
      items { id title status tenant { id name } }
    }
  }`;

const GET_PGS_COMPLAINTS = `
  query GetAllPgsComplaints {
    getAllPgs { id name complaints { id title } }
  }`;

const GET_TENANTS_COMPLAINTS = `
  query GetAllTenantsComplaints($search: String) {
    getAllTenants(search: $search) {
      items { id name complaints { id } }
    }
  }`;

function check(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`FAIL ${label}: expected "${String(expected)}", got "${String(actual)}"`);
  }
  console.log(`PASS: ${label}`);
}

/**
 * The database is shared with the app's other data (e.g. the demo seed), so
 * an unscoped count is only meaningful as a change from a baseline taken
 * before this script creates its own complaints. Assertions scoped by pgId,
 * tenantId, or search term stay absolute.
 */
function checkDelta(label: string, after: number, before: number, added: number): void {
  check(`${label} (+${added})`, after - before, added);
}

/**
 * Global complaint counts by status, used as the delta baseline. The three
 * counts are independent, so they run together.
 */
async function countByStatus(): Promise<Record<'open' | 'in_progress' | 'resolved', number>> {
  const repo = AppDataSource.getRepository(Complaint);
  const [open, inProgress, resolved] = await Promise.all([
    repo
      .createQueryBuilder('complaint')
      .where('complaint.status = :status', { status: ComplaintStatus.Open })
      .getCount(),
    repo
      .createQueryBuilder('complaint')
      .where('complaint.status = :status', { status: ComplaintStatus.InProgress })
      .getCount(),
    repo
      .createQueryBuilder('complaint')
      .where('complaint.status = :status', { status: ComplaintStatus.Resolved })
      .getCount()
  ]);
  return { open, in_progress: inProgress, resolved };
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

/** Removes any data left over from a previous (or partial) run, in FK-safe order. */
async function cleanupTestData(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const pgRepo = AppDataSource.getRepository(Pg);
  const roomRepo = AppDataSource.getRepository(Room);
  const complaintRepo = AppDataSource.getRepository(Complaint);

  const users = await userRepo.find({
    where: { email: In(TEST_USER_EMAILS) }
  });
  if (users.length > 0) {
    const tenants = await tenantRepo.find({
      where: users.map((user) => ({ user: { id: user.id } }))
    });
    if (tenants.length > 0) {
      // Complaints reference tenants and PGs — delete them before their tenants.
      await complaintRepo
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
        name: 'Phase Seven Admin',
        email: TEST_ADMIN_EMAIL,
        password: await hashPassword(TEST_PASSWORD),
        role: UserRole.Admin
      })
    );
    const asAdmin: AuthUser = { id: admin.id, role: 'Admin' };

    // Baseline: what the unscoped complaint counts looked like before this
    // script created any of its own rows.
    const baselineTotal = await AppDataSource.getRepository(Complaint).count();
    const baselineByStatus = await countByStatus();

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
    const rahul = await createTenantViaGql(rahulUser.id, alpha.id, 'Rahul Verma', a101.id);
    await createTenantViaGql(priyaUser.id, alpha.id, 'Priya Sharma');
    const cross = await createTenantViaGql(crossUser.id, beta.id, 'Cross Pg Tenant');

    const createComplaint = async (
      input: Record<string, unknown>,
      user: AuthUser
    ): Promise<ComplaintShape> =>
      field<ComplaintShape>(await exec(CREATE_COMPLAINT, { input }, user), 'createComplaint');

    const updateComplaint = async (
      id: string,
      input: Record<string, unknown>,
      user: AuthUser = asAdmin
    ): Promise<ComplaintShape> =>
      field<ComplaintShape>(await exec(UPDATE_COMPLAINT, { id, input }, user), 'updateComplaint');

    // --- authorization (FR-33: both roles guarded at the resolver) ---
    expectError('guest cannot list complaints', await exec(GET_COMPLAINTS, {}), 'FORBIDDEN');
    expectError(
      'guest cannot read the tenant complaint list',
      await exec(GET_TENANT_COMPLAINTS, {}),
      'FORBIDDEN'
    );
    expectError(
      'guest cannot create a complaint',
      await exec(
        CREATE_COMPLAINT,
        { input: { title: 'x', description: 'y' } }
      ),
      'FORBIDDEN'
    );
    expectError(
      'guest cannot update a complaint',
      await exec(UPDATE_COMPLAINT, { id: NONEXISTENT_ID, input: { title: 'x' } }),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot list all complaints',
      await exec(GET_COMPLAINTS, {}, asTenant(rahulUser)),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot update a complaint',
      await exec(
        UPDATE_COMPLAINT,
        { id: NONEXISTENT_ID, input: { status: 'resolved' } },
        asTenant(rahulUser)
      ),
      'FORBIDDEN'
    );
    expectError(
      'admin cannot read the tenant complaint list',
      await exec(GET_TENANT_COMPLAINTS, {}, asAdmin),
      'FORBIDDEN'
    );
    expectError(
      'admin cannot file a complaint',
      await exec(CREATE_COMPLAINT, { input: { title: 'x', description: 'y' } }, asAdmin),
      'FORBIDDEN'
    );

    // --- createComplaint validation (FR-22) ---
    expectError(
      'createComplaint rejects an empty title',
      await exec(CREATE_COMPLAINT, { input: { title: '', description: 'A problem' } }, asTenant(rahulUser)),
      'BAD_USER_INPUT'
    );
    expectError(
      'createComplaint rejects a whitespace-only title',
      await exec(CREATE_COMPLAINT, { input: { title: '   ', description: 'A problem' } }, asTenant(rahulUser)),
      'BAD_USER_INPUT'
    );
    expectError(
      'createComplaint rejects an over-long title',
      await exec(
        CREATE_COMPLAINT,
        { input: { title: 'x'.repeat(161), description: 'A problem' } },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createComplaint rejects an empty description',
      await exec(CREATE_COMPLAINT, { input: { title: 'A problem', description: '' } }, asTenant(rahulUser)),
      'BAD_USER_INPUT'
    );
    expectError(
      'createComplaint rejects an over-long description',
      await exec(
        CREATE_COMPLAINT,
        { input: { title: 'A problem', description: 'x'.repeat(5001) } },
        asTenant(rahulUser)
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createComplaint rejects a user without a tenant record',
      await exec(
        CREATE_COMPLAINT,
        { input: { title: 'A problem', description: 'From a user with no tenant record' } },
        asTenant(roomlessUser)
      ),
      'BAD_USER_INPUT'
    );

    // --- createComplaint (FR-22): scoping, defaults, trimming ---
    const c1 = await createComplaint(
      { title: '  Water leak in the bathroom  ', description: '  Water pools near the shower every morning.  ' },
      asTenant(rahulUser)
    );
    check('a new complaint starts open', c1.status, 'open');
    check('a new complaint has no resolvedAt', c1.resolvedAt, null);
    check('createComplaint trims the title', c1.title, 'Water leak in the bathroom');
    check('createComplaint trims the description', c1.description, 'Water pools near the shower every morning.');
    check('createComplaint attaches the tenant', c1.tenant?.id, rahul.id);
    check('createComplaint derives the PG from the tenant record', c1.pg?.id, alpha.id);

    const c2 = await createComplaint(
      { title: 'No hot water supply', description: 'The geyser has been cold for three days.' },
      asTenant(rahulUser)
    );
    const c3 = await createComplaint(
      { title: 'Wi-Fi keeps disconnecting', description: 'The connection drops every few minutes.' },
      asTenant(priyaUser)
    );
    const c4 = await createComplaint(
      {
        title: 'Broken window latch',
        description: 'The latch on the kitchen window is broken and will not close.'
      },
      asTenant(crossUser)
    );
    check(
      'a 160-character title is accepted',
      (
        await createComplaint(
          { title: 'y'.repeat(160), description: 'Long-title boundary check.' },
          asTenant(crossUser)
        )
      ).title.length,
      160
    );

    // --- updateComplaint validation and resolvedAt derivation (FR-24) ---
    expectError(
      'updateComplaint rejects an unknown id',
      await exec(UPDATE_COMPLAINT, { id: NONEXISTENT_ID, input: { status: 'resolved' } }, asAdmin),
      'NOT_FOUND'
    );
    // A malformed id must be reported like any other unknown id, never as an
    // internal server error from the uuid column.
    expectError(
      'updateComplaint rejects a malformed id',
      await exec(UPDATE_COMPLAINT, { id: 'not-a-uuid', input: { status: 'resolved' } }, asAdmin),
      'NOT_FOUND'
    );
    expectError(
      'updateComplaint rejects an empty title',
      await exec(UPDATE_COMPLAINT, { id: c1.id, input: { title: '' } }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'updateComplaint rejects a whitespace-only description',
      await exec(UPDATE_COMPLAINT, { id: c1.id, input: { description: '   ' } }, asAdmin),
      'BAD_USER_INPUT'
    );

    const inProgress = await updateComplaint(c1.id, { status: 'in_progress' });
    check('a complaint can move to in_progress', inProgress.status, 'in_progress');
    check('in_progress clears resolvedAt', inProgress.resolvedAt, null);

    const resolved = await updateComplaint(c1.id, { status: 'resolved' });
    check('resolving stores the resolved status', resolved.status, 'resolved');
    check('resolving derives resolvedAt', resolved.resolvedAt !== null && resolved.resolvedAt !== undefined, true);
    check('resolvedAt cannot lie in the future', (resolved.resolvedAt ?? '') <= new Date().toISOString(), true);

    const reopened = await updateComplaint(c1.id, { status: 'open' });
    check('reopening returns the complaint to open', reopened.status, 'open');
    check('reopening clears resolvedAt', reopened.resolvedAt, null);

    const reResolved = await updateComplaint(c1.id, { status: 'resolved' });
    check('re-resolving stores a resolvedAt again', reResolved.resolvedAt !== null && reResolved.resolvedAt !== undefined, true);

    const noop = await updateComplaint(c1.id, {});
    check('an empty update keeps the status', noop.status, 'resolved');
    check('an empty update keeps resolvedAt', noop.resolvedAt, reResolved.resolvedAt);
    check('an empty update keeps the title', noop.title, c1.title);

    const reworded = await updateComplaint(c2.id, {
      title: '  No hot water at all  ',
      description: '  The geyser is still cold.  '
    });
    check('the title update trims the value', reworded.title, 'No hot water at all');
    check('the description update trims the value', reworded.description, 'The geyser is still cold.');
    check('the title update leaves the status open', reworded.status, 'open');

    const c3Updated = await updateComplaint(c3.id, { status: 'in_progress' });
    check('the priya complaint moves to in_progress', c3Updated.status, 'in_progress');

    // --- concurrent updates of one complaint serialize (row lock) ---
    // Two disjoint-field updates racing: both must land, with no lost update.
    const [racedTitle, racedStatus] = await Promise.all([
      exec(UPDATE_COMPLAINT, { id: c4.id, input: { title: 'raced title' } }, asAdmin),
      exec(UPDATE_COMPLAINT, { id: c4.id, input: { status: 'in_progress' } }, asAdmin)
    ]);
    if (!racedTitle.data?.updateComplaint || !racedStatus.data?.updateComplaint) {
      throw new Error(
        `FAIL concurrent updates: one lost (${racedTitle.errors?.[0]?.message ?? 'ok'} / ${racedStatus.errors?.[0]?.message ?? 'ok'})`
      );
    }
    console.log('PASS: concurrent updates of one complaint both land');
    const racedPage = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { tenantId: cross.id }, asAdmin),
      'getAllComplaints'
    );
    const racedComplaint = racedPage.items.find((item) => item.id === c4.id);
    if (!racedComplaint) throw new Error('The raced complaint was not found');
    check('the raced complaint kept the title', racedComplaint.title, 'raced title');
    check('the raced complaint kept the status', racedComplaint.status, 'in_progress');
    check('the raced complaint has no resolvedAt', racedComplaint.resolvedAt, null);

    // --- getAllComplaints: totals, filters, search, pagination (FR-23) ---
    // Final state: c1 resolved, c2 open (reworded), c3 in_progress, c4
    // in_progress (raced), plus the long-title complaint (open, beta): +5
    // unscoped over the baseline.
    const globalPage = field<ComplaintPageShape>(await exec(GET_COMPLAINTS, {}, asAdmin), 'getAllComplaints');
    checkDelta('the complaint list reports the global total', globalPage.total, baselineTotal, 5);
    check('the complaint list defaults to limit 20', globalPage.limit, 20);

    const alphaPage = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { pgId: alpha.id }, asAdmin),
      'getAllComplaints'
    );
    check('the pgId filter scopes to one PG', alphaPage.total, 3);
    const betaPage = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { pgId: beta.id }, asAdmin),
      'getAllComplaints'
    );
    check('the beta filter counts the beta complaints', betaPage.total, 2);

    const rahulPage = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { tenantId: rahul.id }, asAdmin),
      'getAllComplaints'
    );
    check('the tenantId filter scopes to one tenant', rahulPage.total, 2);
    check(
      'the tenant filter returns only that tenant',
      rahulPage.items.every((item) => item.tenant?.id === rahul.id),
      true
    );

    const timestamps = globalPage.items.map((item) => item.createdAt);
    const ordered = timestamps.every((value, i) => {
      if (i === 0) return true;
      const previous = timestamps[i - 1];
      return value !== undefined && previous !== undefined && value <= previous;
    });
    if (!ordered) {
      throw new Error(
        `FAIL the complaint list is not ordered by newest first: ${JSON.stringify(timestamps)}`
      );
    }
    console.log('PASS: the complaint list is ordered by newest first');

    const resolvedFilter = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { status: 'resolved' }, asAdmin),
      'getAllComplaints'
    );
    checkDelta(
      'the resolved filter counts resolved complaints',
      resolvedFilter.total,
      baselineByStatus.resolved,
      1
    );
    const openFilter = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { status: 'open' }, asAdmin),
      'getAllComplaints'
    );
    checkDelta('the open filter counts open complaints', openFilter.total, baselineByStatus.open, 2);
    const inProgressFilter = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { status: 'in_progress' }, asAdmin),
      'getAllComplaints'
    );
    checkDelta(
      'the in_progress filter counts in-progress complaints',
      inProgressFilter.total,
      baselineByStatus.in_progress,
      2
    );
    check(
      'the resolved filter returns the resolvedAt',
      resolvedFilter.items.every((item) => item.status !== 'resolved' || (item.resolvedAt ?? null) !== null),
      true
    );

    // The search terms are unique to this script's fixtures, but each search
    // is still scoped to a test property so the expected totals stay exact
    // regardless of what other data shares the database.
    const byTitle = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { search: 'water leak', pgId: alpha.id }, asAdmin),
      'getAllComplaints'
    );
    check('search matches the complaint title', byTitle.total, 1);
    const byTenantName = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { search: 'rahul verma', pgId: alpha.id }, asAdmin),
      'getAllComplaints'
    );
    check('search matches the tenant name case-insensitively', byTenantName.total, 2);
    const byEmail = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { search: 'phase7.rahul', pgId: alpha.id }, asAdmin),
      'getAllComplaints'
    );
    check('search matches the linked user email', byEmail.total, 2);
    const byRoom = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { search: 'a-101', pgId: alpha.id }, asAdmin),
      'getAllComplaints'
    );
    check('search matches the tenant room number', byRoom.total, 2);
    const byPgName = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { search: 'beta', pgId: beta.id }, asAdmin),
      'getAllComplaints'
    );
    check('search matches the PG name', byPgName.total, 2);
    const byDescription = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { search: 'kitchen window', pgId: beta.id }, asAdmin),
      'getAllComplaints'
    );
    check('search matches the complaint description', byDescription.total, 1);
    const searchMiss = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { search: 'no-such-complaint' }, asAdmin),
      'getAllComplaints'
    );
    check('search can return an empty page', searchMiss.items.length, 0);

    const limited = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { limit: 2, offset: 0 }, asAdmin),
      'getAllComplaints'
    );
    check('the complaint list paginates items', limited.items.length, 2);
    checkDelta('the complaint list reports the total across pages', limited.total, baselineTotal, 5);
    check('the complaint list echoes limit/offset', `${limited.limit}/${limited.offset}`, '2/0');
    // The final page offset depends on the real global total, so it is
    // derived rather than hard-coded.
    const tail = field<ComplaintPageShape>(
      await exec(GET_COMPLAINTS, { limit: 2, offset: globalPage.total - 1 }, asAdmin),
      'getAllComplaints'
    );
    check('the complaint list returns the final partial page', tail.items.length, 1);

    expectError(
      'the complaint list rejects limit 0',
      await exec(GET_COMPLAINTS, { limit: 0 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the complaint list rejects limit above the max',
      await exec(GET_COMPLAINTS, { limit: 101 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the complaint list rejects a negative offset',
      await exec(GET_COMPLAINTS, { offset: -1 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the complaint list rejects an unknown pgId filter',
      await exec(GET_COMPLAINTS, { pgId: NONEXISTENT_ID }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the complaint list rejects an unknown tenantId filter',
      await exec(GET_COMPLAINTS, { tenantId: NONEXISTENT_ID }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the complaint list rejects a malformed pgId filter',
      await exec(GET_COMPLAINTS, { pgId: 'not-a-uuid' }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the complaint list rejects a malformed tenantId filter',
      await exec(GET_COMPLAINTS, { tenantId: 'not-a-uuid' }, asAdmin),
      'BAD_USER_INPUT'
    );

    // --- getTenantComplaints: tenant-scoped (FR-23) ---
    const rahulList = field<ComplaintPageShape>(
      await exec(GET_TENANT_COMPLAINTS, {}, asTenant(rahulUser)),
      'getTenantComplaints'
    );
    check("the tenant list shows the tenant's complaints", rahulList.total, 2);
    check(
      'the tenant list never leaks other tenants',
      rahulList.items.every((item) => item.tenant?.id === rahul.id),
      true
    );
    const rahulListPage = field<ComplaintPageShape>(
      await exec(GET_TENANT_COMPLAINTS, { limit: 1, offset: 0 }, asTenant(rahulUser)),
      'getTenantComplaints'
    );
    check('the tenant list paginates', rahulListPage.items.length, 1);
    check('the tenant list reports the total across pages', rahulListPage.total, 2);

    const priyaList = field<ComplaintPageShape>(
      await exec(GET_TENANT_COMPLAINTS, {}, asTenant(priyaUser)),
      'getTenantComplaints'
    );
    check('another tenant sees only their own complaints', priyaList.total, 1);
    const crossList = field<ComplaintPageShape>(
      await exec(GET_TENANT_COMPLAINTS, {}, asTenant(crossUser)),
      'getTenantComplaints'
    );
    check('the beta tenant sees only their own complaints', crossList.total, 2);
    const roomlessList = field<ComplaintPageShape>(
      await exec(GET_TENANT_COMPLAINTS, {}, asTenant(roomlessUser)),
      'getTenantComplaints'
    );
    check('a user without a tenant record gets an empty page', roomlessList.total, 0);
    check('the empty complaint page has no items', roomlessList.items.length, 0);

    // --- nested resolution through the relation field resolvers ---
    const deep = field<{ items: DeepComplaintShape[] }>(
      await exec(GET_COMPLAINTS_DEEP, { search: 'water leak' }, asAdmin),
      'getAllComplaints'
    );
    const deepComplaint = deep.items[0];
    if (!deepComplaint) throw new Error('Deep complaint query returned no items');
    check('the complaint resolves its tenant', deepComplaint.tenant.name, 'Rahul Verma');
    check('the tenant resolves its user', deepComplaint.tenant.user.email, TENANT_EMAILS[0]);
    check('the complaint resolves its PG', deepComplaint.tenant.pg.name, TEST_PG_NAMES[0]);
    check('the tenant resolves its room', deepComplaint.tenant.room?.roomNumber, 'A-101');

    const pgsPage = field<Array<PgShape & { complaints: ComplaintShape[] }>>(
      await exec(GET_PGS_COMPLAINTS, {}, asAdmin),
      'getAllPgs'
    );
    const alphaPg = pgsPage.find((pg) => pg.id === alpha.id);
    if (!alphaPg) throw new Error('The alpha PG was not returned');
    check('Pg.complaints resolves the PG complaints', alphaPg.complaints.length, 3);

    const tenantsPage = field<{ items: Array<{ id: string; name: string; complaints: ComplaintShape[] }> }>(
      await exec(GET_TENANTS_COMPLAINTS, { search: 'Priya Sharma' }, asAdmin),
      'getAllTenants'
    );
    const priyaTenant = tenantsPage.items[0];
    if (!priyaTenant) throw new Error('Priya was not returned');
    check('Tenant.complaints resolves the tenant own complaints', priyaTenant.complaints.length, 1);

    // --- write-invariant integrity sweep ---
    const complaintRepo = AppDataSource.getRepository(Complaint);
    const testComplaints = await complaintRepo
      .createQueryBuilder('complaint')
      .leftJoinAndSelect('complaint.tenant', 'tenant')
      .leftJoin('tenant.user', 'user')
      .where('user.email IN (:...emails)', { emails: TENANT_EMAILS })
      .getMany();
    if (testComplaints.length !== 5) {
      throw new Error(`Expected 5 test complaints for the sweep, found ${testComplaints.length}`);
    }
    for (const complaint of testComplaints) {
      if (!Object.values(ComplaintStatus).includes(complaint.status)) {
        throw new Error(`FAIL integrity: complaint ${complaint.id} has an unknown status`);
      }
      const resolvedState = complaint.status === ComplaintStatus.Resolved;
      if (resolvedState !== (complaint.resolvedAt !== null && complaint.resolvedAt !== undefined)) {
        throw new Error(
          `FAIL integrity: complaint ${complaint.id} status and resolvedAt disagree`
        );
      }
    }
    console.log('PASS: every complaint satisfies the status/resolvedAt invariant');

    console.log('\nAll Phase 7 complaint management checks passed.');
  } finally {
    await cleanupTestData();
    await server.stop();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Phase 7 verification FAILED:', error);
  process.exit(1);
});
