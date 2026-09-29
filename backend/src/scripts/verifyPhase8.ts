/**
 * Phase 8 verification: exercises announcement management through the real
 * GraphQL layer (same typeDefs/resolvers the Express app serves) —
 * authorization (admin writes, tenant reads own PG, both roles guarded),
 * input validation, creation scoping (PG + caller-derived creator), partial
 * updates, searchable/filterable/paginated admin listing, tenant-scoped
 * PG listing, nested resolution, concurrent updates of one announcement,
 * and a write-invariant integrity sweep. Creates throwaway data and cleans
 * up.
 *
 * Run: npx ts-node --transpile-only src/scripts/verifyPhase8.ts
 */
import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import type { Request, Response } from 'express';
import { GraphQLFormattedError } from 'graphql';
import { In } from 'typeorm';

import { AppDataSource } from '../config/db';
import { Announcement } from '../entities/announcement.entity';
import { Pg } from '../entities/pg.entity';
import { Room } from '../entities/room.entity';
import { Tenant } from '../entities/tenant.entity';
import { User, UserRole } from '../entities/user.entity';
import { resolvers } from '../graphql/resolvers';
import { typeDefs } from '../graphql/typeDefs';
import type { AuthUser } from '../types';
import { hashPassword } from '../utils/password';

const TEST_ADMIN_EMAIL = 'phase8.admin@hostel.test';
const TEST_ADMIN_NAME = 'Phase Eight Admin';
const TEST_PASSWORD = 'phase8-verify-password';
const TEST_PG_NAMES = ['Phase8 Verify PG Alpha', 'Phase8 Verify PG Beta'];
const TENANT_EMAILS = [
  'phase8.rahul@hostel.test',
  'phase8.priya@hostel.test',
  'phase8.cross@hostel.test'
];
const ROOMLESS_EMAIL = 'phase8.roomless@hostel.test';
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

interface AnnouncementShape {
  id: string;
  title: string;
  content: string;
  createdAt?: string;
  pg?: { id: string; name: string };
  createdBy?: { id: string; name: string; email: string };
}

interface AnnouncementPageShape {
  total: number;
  limit: number;
  offset: number;
  items: AnnouncementShape[];
}

interface DeepAnnouncementShape {
  id: string;
  title: string;
  pg: { id: string; name: string };
  createdBy: { id: string; name: string; email: string };
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

const CREATE_ANNOUNCEMENT = `
  mutation CreateAnnouncement($input: CreateAnnouncementInput!) {
    createAnnouncement(input: $input) {
      id title content
      pg { id name }
      createdBy { id name email }
    }
  }`;

const UPDATE_ANNOUNCEMENT = `
  mutation UpdateAnnouncement($id: ID!, $input: UpdateAnnouncementInput!) {
    updateAnnouncement(id: $id, input: $input) {
      id title content
      pg { id name }
      createdBy { id name }
    }
  }`;

const GET_ANNOUNCEMENTS = `
  query GetAllAnnouncements($search: String, $pgId: ID, $limit: Int, $offset: Int) {
    getAllAnnouncements(search: $search, pgId: $pgId, limit: $limit, offset: $offset) {
      total limit offset
      items { id title content createdAt pg { id name } createdBy { id name } }
    }
  }`;

const GET_ANNOUNCEMENTS_DEEP = `
  query GetAllAnnouncementsDeep($search: String) {
    getAllAnnouncements(search: $search) {
      items {
        id title
        pg { id name }
        createdBy { id name email }
      }
    }
  }`;

const GET_TENANT_PG_ANNOUNCEMENTS = `
  query GetTenantPgAnnouncements($limit: Int, $offset: Int) {
    getTenantPgAnnouncements(limit: $limit, offset: $offset) {
      total limit offset
      items { id title content pg { id name } createdBy { id name } }
    }
  }`;

const GET_PGS_ANNOUNCEMENTS = `
  query GetAllPgsAnnouncements {
    getAllPgs { id name announcements { id title } }
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

/** Removes any data left over from a previous (or partial) run, in FK-safe order. */
async function cleanupTestData(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const pgRepo = AppDataSource.getRepository(Pg);
  const roomRepo = AppDataSource.getRepository(Room);
  const announcementRepo = AppDataSource.getRepository(Announcement);

  const users = await userRepo.find({
    where: { email: In(TEST_USER_EMAILS) }
  });
  if (users.length > 0) {
    const tenants = await tenantRepo.find({
      where: users.map((user) => ({ user: { id: user.id } }))
    });
    if (tenants.length > 0) {
      await tenantRepo.delete(tenants.map((tenant) => tenant.id));
    }
    // Announcements reference the admin creator — delete them before the users.
    await announcementRepo
      .createQueryBuilder()
      .delete()
      .where('"createdById" IN (:...userIds)', { userIds: users.map((user) => user.id) })
      .execute();
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
    // Announcements also reference the PGs — delete them before the PGs.
    await announcementRepo
      .createQueryBuilder()
      .delete()
      .where('"pgId" IN (:...pgIds)', { pgIds: pgs.map((pg) => pg.id) })
      .execute();
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
    await createTenantViaGql(rahulUser.id, alpha.id, 'Rahul Verma', a101.id);
    await createTenantViaGql(priyaUser.id, alpha.id, 'Priya Sharma');
    await createTenantViaGql(crossUser.id, beta.id, 'Cross Pg Tenant');

    const createAnnouncement = async (
      input: Record<string, unknown>,
      user: AuthUser = asAdmin
    ): Promise<AnnouncementShape> =>
      field<AnnouncementShape>(
        await exec(CREATE_ANNOUNCEMENT, { input }, user),
        'createAnnouncement'
      );

    const updateAnnouncement = async (
      id: string,
      input: Record<string, unknown>,
      user: AuthUser = asAdmin
    ): Promise<AnnouncementShape> =>
      field<AnnouncementShape>(
        await exec(UPDATE_ANNOUNCEMENT, { id, input }, user),
        'updateAnnouncement'
      );

    // --- authorization (FR-33: both roles guarded at the resolver) ---
    expectError('guest cannot list all announcements', await exec(GET_ANNOUNCEMENTS, {}), 'FORBIDDEN');
    expectError(
      'guest cannot read the tenant announcement list',
      await exec(GET_TENANT_PG_ANNOUNCEMENTS, {}),
      'FORBIDDEN'
    );
    expectError(
      'guest cannot create an announcement',
      await exec(
        CREATE_ANNOUNCEMENT,
        { input: { pgId: alpha.id, title: 'x', content: 'y' } }
      ),
      'FORBIDDEN'
    );
    expectError(
      'guest cannot update an announcement',
      await exec(UPDATE_ANNOUNCEMENT, { id: NONEXISTENT_ID, input: { title: 'x' } }),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot list all announcements',
      await exec(GET_ANNOUNCEMENTS, {}, asTenant(rahulUser)),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot create an announcement',
      await exec(
        CREATE_ANNOUNCEMENT,
        { input: { pgId: alpha.id, title: 'x', content: 'y' } },
        asTenant(rahulUser)
      ),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot update an announcement',
      await exec(
        UPDATE_ANNOUNCEMENT,
        { id: NONEXISTENT_ID, input: { title: 'x' } },
        asTenant(rahulUser)
      ),
      'FORBIDDEN'
    );
    expectError(
      'admin cannot read the tenant announcement list',
      await exec(GET_TENANT_PG_ANNOUNCEMENTS, {}, asAdmin),
      'FORBIDDEN'
    );

    // --- createAnnouncement validation (FR-25) ---
    expectError(
      'createAnnouncement rejects an unknown pgId',
      await exec(
        CREATE_ANNOUNCEMENT,
        { input: { pgId: NONEXISTENT_ID, title: 'A notice', content: 'Body' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createAnnouncement rejects a malformed pgId',
      await exec(
        CREATE_ANNOUNCEMENT,
        { input: { pgId: 'not-a-uuid', title: 'A notice', content: 'Body' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createAnnouncement rejects a missing pgId',
      await exec(
        CREATE_ANNOUNCEMENT,
        { input: { pgId: '', title: 'A notice', content: 'Body' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createAnnouncement rejects an empty title',
      await exec(
        CREATE_ANNOUNCEMENT,
        { input: { pgId: alpha.id, title: '', content: 'Body' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createAnnouncement rejects a whitespace-only title',
      await exec(
        CREATE_ANNOUNCEMENT,
        { input: { pgId: alpha.id, title: '   ', content: 'Body' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createAnnouncement rejects an over-long title',
      await exec(
        CREATE_ANNOUNCEMENT,
        { input: { pgId: alpha.id, title: 'x'.repeat(161), content: 'Body' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createAnnouncement rejects an empty content',
      await exec(
        CREATE_ANNOUNCEMENT,
        { input: { pgId: alpha.id, title: 'A notice', content: '' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createAnnouncement rejects over-long content',
      await exec(
        CREATE_ANNOUNCEMENT,
        { input: { pgId: alpha.id, title: 'A notice', content: 'x'.repeat(5001) } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );

    // --- createAnnouncement (FR-25): scoping, creator, trimming ---
    const a1 = await createAnnouncement({
      pgId: alpha.id,
      title: '  Water supply maintenance  ',
      content: '  Water will be off from 10am to 2pm on Sunday.  '
    });
    check('createAnnouncement trims the title', a1.title, 'Water supply maintenance');
    check('createAnnouncement trims the content', a1.content, 'Water will be off from 10am to 2pm on Sunday.');
    check('createAnnouncement attaches the PG', a1.pg?.id, alpha.id);
    check('createAnnouncement attributes the creator', a1.createdBy?.id, admin.id);
    check('the creator is the calling admin', a1.createdBy?.name, TEST_ADMIN_NAME);

    const a2 = await createAnnouncement({
      pgId: alpha.id,
      title: 'Wi-Fi upgrade this weekend',
      content: 'The Wi-Fi routers will be replaced on Saturday morning.'
    });
    await createAnnouncement({
      pgId: beta.id,
      title: 'Beta PG town hall meeting',
      content: 'Monthly meeting in the common area this Friday evening.'
    });
    const longTitle = await createAnnouncement({
      pgId: alpha.id,
      title: 'y'.repeat(160),
      content: 'Long-title boundary check.'
    });
    check('a 160-character title is accepted', longTitle.title.length, 160);

    // --- updateAnnouncement validation (FR-26) ---
    expectError(
      'updateAnnouncement rejects an unknown id',
      await exec(UPDATE_ANNOUNCEMENT, { id: NONEXISTENT_ID, input: { title: 'x' } }, asAdmin),
      'NOT_FOUND'
    );
    // A malformed id must be reported like any other unknown id, never as an
    // internal server error from the uuid column.
    expectError(
      'updateAnnouncement rejects a malformed id',
      await exec(UPDATE_ANNOUNCEMENT, { id: 'not-a-uuid', input: { title: 'x' } }, asAdmin),
      'NOT_FOUND'
    );
    expectError(
      'updateAnnouncement rejects an empty title',
      await exec(UPDATE_ANNOUNCEMENT, { id: a1.id, input: { title: '' } }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'updateAnnouncement rejects a whitespace-only content',
      await exec(UPDATE_ANNOUNCEMENT, { id: a1.id, input: { content: '   ' } }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'updateAnnouncement rejects an over-long title',
      await exec(
        UPDATE_ANNOUNCEMENT,
        { id: a1.id, input: { title: 'x'.repeat(161) } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );

    // --- updateAnnouncement (FR-26): partial updates, immutable scope ---
    const reworded = await updateAnnouncement(a1.id, {
      title: '  Water supply maintenance (updated)  ',
      content: '  Water will be off from 9am to 1pm on Sunday.  '
    });
    check('the title update trims the value', reworded.title, 'Water supply maintenance (updated)');
    check('the content update trims the value', reworded.content, 'Water will be off from 9am to 1pm on Sunday.');
    check('the update keeps the PG', reworded.pg?.id, alpha.id);
    check('the update keeps the creator', reworded.createdBy?.id, admin.id);

    const noop = await updateAnnouncement(a1.id, {});
    check('an empty update keeps the title', noop.title, reworded.title);
    check('an empty update keeps the content', noop.content, reworded.content);

    // --- concurrent updates of one announcement serialize (row lock) ---
    // Two disjoint-field updates racing: both must land, with no lost update.
    const [racedTitle, racedContent] = await Promise.all([
      exec(UPDATE_ANNOUNCEMENT, { id: a2.id, input: { title: 'raced title' } }, asAdmin),
      exec(UPDATE_ANNOUNCEMENT, { id: a2.id, input: { content: 'raced content body' } }, asAdmin)
    ]);
    if (!racedTitle.data?.updateAnnouncement || !racedContent.data?.updateAnnouncement) {
      throw new Error(
        `FAIL concurrent updates: one lost (${racedTitle.errors?.[0]?.message ?? 'ok'} / ${racedContent.errors?.[0]?.message ?? 'ok'})`
      );
    }
    console.log('PASS: concurrent updates of one announcement both land');
    const racedPage = field<AnnouncementPageShape>(
      await exec(GET_ANNOUNCEMENTS, { pgId: alpha.id, search: 'raced' }, asAdmin),
      'getAllAnnouncements'
    );
    const racedAnnouncement = racedPage.items.find((item) => item.id === a2.id);
    if (!racedAnnouncement) throw new Error('The raced announcement was not found');
    check('the raced announcement kept the title', racedAnnouncement.title, 'raced title');
    check('the raced announcement kept the content', racedAnnouncement.content, 'raced content body');

    // --- getAllAnnouncements: totals, filters, search, pagination (admin) ---
    const alphaPage = field<AnnouncementPageShape>(
      await exec(GET_ANNOUNCEMENTS, { pgId: alpha.id }, asAdmin),
      'getAllAnnouncements'
    );
    check('the pgId filter scopes to one PG', alphaPage.total, 3);
    check('the alpha filter returns only alpha announcements', alphaPage.items.every((i) => i.pg?.id === alpha.id), true);
    check('the announcement list defaults to limit 20', alphaPage.limit, 20);

    const betaPage = field<AnnouncementPageShape>(
      await exec(GET_ANNOUNCEMENTS, { pgId: beta.id }, asAdmin),
      'getAllAnnouncements'
    );
    check('the beta filter counts the beta announcements', betaPage.total, 1);

    const timestamps = alphaPage.items.map((item) => item.createdAt);
    const ordered = timestamps.every((value, i) => {
      if (i === 0) return true;
      const previous = timestamps[i - 1];
      return value !== undefined && previous !== undefined && value <= previous;
    });
    if (!ordered) {
      throw new Error(
        `FAIL the announcement list is not ordered by newest first: ${JSON.stringify(timestamps)}`
      );
    }
    console.log('PASS: the announcement list is ordered by newest first');

    const byTitle = field<AnnouncementPageShape>(
      await exec(GET_ANNOUNCEMENTS, { search: 'Water supply maintenance', pgId: alpha.id }, asAdmin),
      'getAllAnnouncements'
    );
    check('search matches the announcement title', byTitle.total, 1);
    const byContent = field<AnnouncementPageShape>(
      await exec(GET_ANNOUNCEMENTS, { search: 'common area this friday', pgId: beta.id }, asAdmin),
      'getAllAnnouncements'
    );
    check('search matches the announcement content case-insensitively', byContent.total, 1);
    const byPgName = field<AnnouncementPageShape>(
      await exec(GET_ANNOUNCEMENTS, { search: 'phase8 verify pg beta' }, asAdmin),
      'getAllAnnouncements'
    );
    check('search matches the PG name', byPgName.total, 1);
    const searchMiss = field<AnnouncementPageShape>(
      await exec(GET_ANNOUNCEMENTS, { search: 'no-such-announcement', pgId: alpha.id }, asAdmin),
      'getAllAnnouncements'
    );
    check('search can return an empty page', searchMiss.items.length, 0);

    const limited = field<AnnouncementPageShape>(
      await exec(GET_ANNOUNCEMENTS, { pgId: alpha.id, limit: 2, offset: 0 }, asAdmin),
      'getAllAnnouncements'
    );
    check('the announcement list paginates items', limited.items.length, 2);
    check('the announcement list reports the total across pages', limited.total, 3);
    check('the announcement list echoes limit/offset', `${limited.limit}/${limited.offset}`, '2/0');
    const tail = field<AnnouncementPageShape>(
      await exec(GET_ANNOUNCEMENTS, { pgId: alpha.id, limit: 2, offset: 2 }, asAdmin),
      'getAllAnnouncements'
    );
    check('the announcement list returns the final partial page', tail.items.length, 1);

    expectError(
      'the announcement list rejects limit 0',
      await exec(GET_ANNOUNCEMENTS, { limit: 0 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the announcement list rejects limit above the max',
      await exec(GET_ANNOUNCEMENTS, { limit: 101 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the announcement list rejects a negative offset',
      await exec(GET_ANNOUNCEMENTS, { offset: -1 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the announcement list rejects an unknown pgId filter',
      await exec(GET_ANNOUNCEMENTS, { pgId: NONEXISTENT_ID }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the announcement list rejects a malformed pgId filter',
      await exec(GET_ANNOUNCEMENTS, { pgId: 'not-a-uuid' }, asAdmin),
      'BAD_USER_INPUT'
    );

    // --- getTenantPgAnnouncements: tenant-scoped PG list (FR-27) ---
    const rahulList = field<AnnouncementPageShape>(
      await exec(GET_TENANT_PG_ANNOUNCEMENTS, {}, asTenant(rahulUser)),
      'getTenantPgAnnouncements'
    );
    check("the tenant list shows the tenant's PG announcements", rahulList.total, 3);
    check(
      'the tenant list never leaks another PG',
      rahulList.items.every((item) => item.pg?.id === alpha.id),
      true
    );
    check(
      'the tenant list resolves the creator',
      rahulList.items.every((item) => item.createdBy?.id === admin.id),
      true
    );
    const rahulListPage = field<AnnouncementPageShape>(
      await exec(GET_TENANT_PG_ANNOUNCEMENTS, { limit: 1, offset: 0 }, asTenant(rahulUser)),
      'getTenantPgAnnouncements'
    );
    check('the tenant list paginates', rahulListPage.items.length, 1);
    check('the tenant list reports the total across pages', rahulListPage.total, 3);

    const priyaList = field<AnnouncementPageShape>(
      await exec(GET_TENANT_PG_ANNOUNCEMENTS, {}, asTenant(priyaUser)),
      'getTenantPgAnnouncements'
    );
    check('another tenant of the same PG sees the same announcements', priyaList.total, 3);
    const crossList = field<AnnouncementPageShape>(
      await exec(GET_TENANT_PG_ANNOUNCEMENTS, {}, asTenant(crossUser)),
      'getTenantPgAnnouncements'
    );
    check('the beta tenant sees only their own PG', crossList.total, 1);
    check(
      'the beta list never leaks the alpha announcements',
      crossList.items.every((item) => item.pg?.id === beta.id),
      true
    );
    const roomlessList = field<AnnouncementPageShape>(
      await exec(GET_TENANT_PG_ANNOUNCEMENTS, {}, asTenant(roomlessUser)),
      'getTenantPgAnnouncements'
    );
    check('a user without a tenant record gets an empty page', roomlessList.total, 0);
    check('the empty announcement page has no items', roomlessList.items.length, 0);

    // --- nested resolution through the relation field resolvers ---
    const deep = field<{ items: DeepAnnouncementShape[] }>(
      await exec(GET_ANNOUNCEMENTS_DEEP, { search: 'town hall meeting' }, asAdmin),
      'getAllAnnouncements'
    );
    const deepAnnouncement = deep.items[0];
    if (!deepAnnouncement) throw new Error('Deep announcement query returned no items');
    check('the announcement resolves its PG', deepAnnouncement.pg.name, TEST_PG_NAMES[1]);
    check('the announcement resolves its creator', deepAnnouncement.createdBy.email, TEST_ADMIN_EMAIL);

    const pgsPage = field<Array<PgShape & { announcements: AnnouncementShape[] }>>(
      await exec(GET_PGS_ANNOUNCEMENTS, {}, asAdmin),
      'getAllPgs'
    );
    const alphaPg = pgsPage.find((pg) => pg.id === alpha.id);
    if (!alphaPg) throw new Error('The alpha PG was not returned');
    check('Pg.announcements resolves the PG announcements', alphaPg.announcements.length, 3);
    const betaPg = pgsPage.find((pg) => pg.id === beta.id);
    if (!betaPg) throw new Error('The beta PG was not returned');
    check('Pg.announcements resolves the beta PG announcements', betaPg.announcements.length, 1);

    // --- write-invariant integrity sweep ---
    const announcementRepo = AppDataSource.getRepository(Announcement);
    const testAnnouncements = await announcementRepo
      .createQueryBuilder('announcement')
      .leftJoinAndSelect('announcement.pg', 'pg')
      .leftJoinAndSelect('announcement.createdBy', 'createdBy')
      .where('pg.name IN (:...names)', { names: TEST_PG_NAMES })
      .getMany();
    if (testAnnouncements.length !== 4) {
      throw new Error(`Expected 4 test announcements for the sweep, found ${testAnnouncements.length}`);
    }
    for (const announcement of testAnnouncements) {
      if (announcement.title.length === 0 || announcement.title.length > 160) {
        throw new Error(`FAIL integrity: announcement ${announcement.id} has an invalid title length`);
      }
      if (announcement.content.length === 0 || announcement.content.length > 5000) {
        throw new Error(`FAIL integrity: announcement ${announcement.id} has an invalid content length`);
      }
      if (announcement.pg.id !== alpha.id && announcement.pg.id !== beta.id) {
        throw new Error(`FAIL integrity: announcement ${announcement.id} points at a foreign PG`);
      }
      if (announcement.createdBy.id !== admin.id) {
        throw new Error(`FAIL integrity: announcement ${announcement.id} has a foreign creator`);
      }
    }
    console.log('PASS: every announcement satisfies the scoping invariant');

    console.log('\nAll Phase 8 announcement management checks passed.');
  } finally {
    await cleanupTestData();
    await server.stop();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Phase 8 verification FAILED:', error);
  process.exit(1);
});
