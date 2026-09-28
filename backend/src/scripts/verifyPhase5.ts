/**
 * Phase 5 verification: exercises tenant management through the real GraphQL
 * layer (same typeDefs/resolvers the Express app serves) — authorization,
 * input validation, PG/room assignment and reassignment occupancy
 * invariants (including a concurrent race for a room's last bed), user
 * re-linking, searchable/paginated tenant listing, nested resolution, and
 * the tenant-facing PG/room query. Creates throwaway data and cleans up.
 *
 * Run: npx ts-node --transpile-only src/scripts/verifyPhase5.ts
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
import { User, UserRole } from '../entities/user.entity';
import { resolvers } from '../graphql/resolvers';
import { typeDefs } from '../graphql/typeDefs';
import type { AuthUser } from '../types';
import { hashPassword } from '../utils/password';

const TEST_ADMIN_EMAIL = 'phase5.admin@hostel.test';
const TEST_PASSWORD = 'phase5-verify-password';
const TEST_PG_NAMES = ['Phase5 Verify PG Alpha', 'Phase5 Verify PG Beta'];
const NAMED_EMAILS = [
  'phase5.rahul@hostel.test',
  'phase5.priya@hostel.test',
  'phase5.arjun@hostel.test',
  'phase5.neha@hostel.test'
];
const RACER_EMAILS = ['phase5.racer.a@hostel.test', 'phase5.racer.b@hostel.test'];
const LINK_EMAIL = 'phase5.link@hostel.test';
const BULK_EMAILS = Array.from({ length: 8 }, (_unused, i) => `phase5.bulk${String(i + 1).padStart(2, '0')}@hostel.test`);
const TEST_USER_EMAILS = [...NAMED_EMAILS, ...RACER_EMAILS, LINK_EMAIL, ...BULK_EMAILS];
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
  occupiedCount: number;
  capacity?: number;
}

interface RoomPageShape {
  total: number;
  limit: number;
  offset: number;
  items: RoomShape[];
}

interface TenantShape {
  id: string;
  name: string;
  phone?: string | null;
  emergencyContact?: string | null;
  joinDate?: string | null;
  user?: { id: string; email: string; role?: string };
  pg?: { id: string; name: string };
  room?: { id: string; roomNumber: string; occupiedCount: number; capacity?: number } | null;
  createdAt?: string;
}

interface TenantPageShape {
  total: number;
  limit: number;
  offset: number;
  items: TenantShape[];
}

interface TenantPgRoomShape {
  pg: { id: string; name: string };
  room: { id: string; roomNumber: string };
}

interface DeepTenantShape {
  id: string;
  name: string;
  user: { id: string; email: string; tenant: { id: string; name: string } | null };
  pg: { id: string; name: string; rooms: { id: string; roomNumber: string }[] };
  room: { id: string; roomNumber: string; pg: { id: string; name: string } } | null;
}

interface DeepRoomShape {
  id: string;
  tenants: {
    id: string;
    name: string;
    user: { email: string };
    pg: { id: string; name: string };
  }[];
}

const CREATE_PG = `
  mutation CreatePg($input: CreatePgInput!) {
    createPg(input: $input) { id name }
  }`;

const CREATE_ROOM = `
  mutation CreateRoom($input: CreateRoomInput!) {
    createRoom(input: $input) { id roomNumber capacity occupiedCount }
  }`;

const GET_ALL_ROOMS = `
  query GetAllRooms($search: String, $pgId: ID, $limit: Int, $offset: Int) {
    getAllRooms(search: $search, pgId: $pgId, limit: $limit, offset: $offset) {
      items { id roomNumber occupiedCount }
    }
  }`;

const GET_ALL_ROOMS_DEEP = `
  query GetAllRoomsDeep($search: String, $pgId: ID) {
    getAllRooms(search: $search, pgId: $pgId) {
      items { id tenants { id name user { email } pg { id name } } }
    }
  }`;

const CREATE_TENANT = `
  mutation CreateTenant($input: CreateTenantInput!) {
    createTenant(input: $input) {
      id name phone emergencyContact joinDate
      user { id email role }
      pg { id name }
      room { id roomNumber occupiedCount capacity }
      createdAt updatedAt
    }
  }`;

const UPDATE_TENANT = `
  mutation UpdateTenant($id: ID!, $input: UpdateTenantInput!) {
    updateTenant(id: $id, input: $input) {
      id name phone emergencyContact joinDate
      user { id email }
      pg { id name }
      room { id roomNumber occupiedCount }
    }
  }`;

const GET_ALL_TENANTS = `
  query GetAllTenants($search: String, $pgId: ID, $limit: Int, $offset: Int) {
    getAllTenants(search: $search, pgId: $pgId, limit: $limit, offset: $offset) {
      total limit offset
      items {
        id name phone joinDate
        user { id email }
        pg { id name }
        room { id roomNumber occupiedCount }
      }
    }
  }`;

const GET_ALL_TENANTS_DEEP = `
  query GetAllTenantsDeep($search: String, $pgId: ID) {
    getAllTenants(search: $search, pgId: $pgId) {
      items {
        id name
        user { id email tenant { id name } }
        pg { id name rooms { id roomNumber } }
        room { id roomNumber pg { id name } }
      }
    }
  }`;

const GET_TENANT_PG_ROOM = `
  query GetTenantPgRoom {
    getTenantPgRoom { pg { id name } room { id roomNumber } }
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

/** True when the result's `key` payload is present and error-free. */
function succeeded(result: GqlResult, key: string): boolean {
  return (
    (!result.errors || result.errors.length === 0) &&
    result.data != null &&
    key in result.data &&
    result.data[key] != null
  );
}

/** Removes any data left over from a previous (or partial) run, in FK-safe order. */
async function cleanupTestData(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const pgRepo = AppDataSource.getRepository(Pg);
  const roomRepo = AppDataSource.getRepository(Room);

  const users = await userRepo.find({
    where: { email: In([TEST_ADMIN_EMAIL, ...TEST_USER_EMAILS]) }
  });
  const pgs = await pgRepo.find({ where: { name: In(TEST_PG_NAMES) } });

  if (users.length > 0) {
    const tenants = await tenantRepo.find({
      where: users.map((user) => ({ user: { id: user.id } }))
    });
    if (tenants.length > 0) {
      await tenantRepo.delete(tenants.map((tenant) => tenant.id));
    }
  }

  if (pgs.length > 0) {
    const rooms = await roomRepo.find({
      where: pgs.map((pg) => ({ pg: { id: pg.id } }))
    });
    if (rooms.length > 0) {
      await roomRepo.delete(rooms.map((room) => room.id));
    }
    await pgRepo.delete(pgs.map((pg) => pg.id));
  }

  if (users.length > 0) {
    await userRepo.delete(users.map((user) => user.id));
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
        name: 'Phase Five Admin',
        email: TEST_ADMIN_EMAIL,
        password: await hashPassword(TEST_PASSWORD),
        role: UserRole.Admin
      })
    );
    const asAdmin: AuthUser = { id: admin.id, role: 'Admin' };

    /** Reads a room's occupancy through the GraphQL room list (search-scoped). */
    const occupancyOf = async (pgId: string, roomNumber: string): Promise<number> => {
      const page = field<RoomPageShape>(
        await exec(GET_ALL_ROOMS, { pgId, search: roomNumber }, asAdmin),
        'getAllRooms'
      );
      const room = page.items.find((item) => item.roomNumber === roomNumber);
      if (!room) {
        throw new Error(`Room ${roomNumber} not found during an occupancy check`);
      }
      return room.occupiedCount;
    };

    const createTestUser = async (name: string, email: string): Promise<User> =>
      userRepo.save(
        userRepo.create({
          name,
          email,
          password: await hashPassword(TEST_PASSWORD),
          role: UserRole.Tenant
        })
      );

    const [rahulUser, priyaUser, arjunUser, nehaUser] = await Promise.all(
      NAMED_EMAILS.slice(0, 4).map((email, i) =>
        createTestUser(['Rahul Verma', 'Priya Sharma', 'Arjun Patel', 'Neha Singh'][i], email)
      )
    );
    const [racerA, racerB] = await Promise.all(
      RACER_EMAILS.map((email, i) => createTestUser(`Race Tenant ${i === 0 ? 'A' : 'B'}`, email))
    );
    const linkUser = await createTestUser('Link Target', LINK_EMAIL);
    const bulkUsers = await Promise.all(
      BULK_EMAILS.map((email, i) => createTestUser(`Bulk Tenant ${String(i + 1).padStart(2, '0')}`, email))
    );

    const asTenant = (user: User): AuthUser => ({ id: user.id, role: 'Tenant' });

    // --- PGs and rooms (Phase 4 operations, already verified) ---
    const createPgViaGql = async (name: string): Promise<PgShape> =>
      field<PgShape>(
        await exec(CREATE_PG, { input: { name, address: `${name} address` } }, asAdmin),
        'createPg'
      );
    const alpha = await createPgViaGql(TEST_PG_NAMES[0]);
    const beta = await createPgViaGql(TEST_PG_NAMES[1]);

    const createRoomViaGql = async (pgId: string, roomNumber: string, capacity: number): Promise<RoomShape> =>
      field<RoomShape>(
        await exec(CREATE_ROOM, { input: { pgId, roomNumber, capacity, rent: 5000 } }, asAdmin),
        'createRoom'
      );
    // A-101 capacity 2 (assignment flows), A-102 capacity 1 (race test),
    // A-103 capacity 3 (reassignment flows), B-201 capacity 2 (PG move).
    const a101 = await createRoomViaGql(alpha.id, 'A-101', 2);
    const a102 = await createRoomViaGql(alpha.id, 'A-102', 1);
    const a103 = await createRoomViaGql(alpha.id, 'A-103', 3);
    const b201 = await createRoomViaGql(beta.id, 'B-201', 2);

    // --- authorization (FR-33: both roles guarded at the resolver) ---
    expectError('guest cannot list tenants', await exec(GET_ALL_TENANTS, {}), 'FORBIDDEN');
    expectError(
      'tenant cannot list tenants',
      await exec(GET_ALL_TENANTS, {}, asTenant(rahulUser)),
      'FORBIDDEN'
    );
    expectError(
      'guest cannot create a tenant',
      await exec(CREATE_TENANT, { input: { userId: rahulUser.id, pgId: alpha.id, name: 'Guest' } }),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot create a tenant',
      await exec(
        CREATE_TENANT,
        { input: { userId: priyaUser.id, pgId: alpha.id, name: 'Self Serve' } },
        asTenant(rahulUser)
      ),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot update a tenant',
      await exec(UPDATE_TENANT, { id: NONEXISTENT_ID, input: { name: 'Nope' } }, asTenant(rahulUser)),
      'FORBIDDEN'
    );

    // --- createTenant validation (FR-13, FR-15) ---
    expectError(
      'createTenant rejects an unknown user',
      await exec(
        CREATE_TENANT,
        { input: { userId: NONEXISTENT_ID, pgId: alpha.id, name: 'Nobody' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createTenant rejects an Admin-role user',
      await exec(CREATE_TENANT, { input: { userId: admin.id, pgId: alpha.id, name: 'Admin Tenant' } }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'createTenant rejects an unknown PG',
      await exec(CREATE_TENANT, { input: { userId: rahulUser.id, pgId: NONEXISTENT_ID, name: 'Nowhere' } }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'createTenant rejects an unknown room',
      await exec(
        CREATE_TENANT,
        { input: { userId: rahulUser.id, pgId: alpha.id, roomId: NONEXISTENT_ID, name: 'Roomless' } },
        asAdmin
      ),
      'NOT_FOUND'
    );
    expectError(
      'createTenant rejects a short name',
      await exec(CREATE_TENANT, { input: { userId: rahulUser.id, pgId: alpha.id, name: 'x' } }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'createTenant rejects a malformed join date',
      await exec(
        CREATE_TENANT,
        { input: { userId: rahulUser.id, pgId: alpha.id, name: 'Bad Date', joinDate: '30-01-2026' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createTenant rejects an impossible calendar date',
      await exec(
        CREATE_TENANT,
        { input: { userId: rahulUser.id, pgId: alpha.id, name: 'Bad Date', joinDate: '2026-02-30' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createTenant rejects an over-long phone',
      await exec(
        CREATE_TENANT,
        { input: { userId: rahulUser.id, pgId: alpha.id, name: 'Long Phone', phone: '012345678901234567890' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );

    expectError(
      'createTenant rejects assigning a room that belongs to another PG',
      await exec(
        CREATE_TENANT,
        { input: { userId: arjunUser.id, pgId: alpha.id, roomId: b201.id, name: 'Cross Pg' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );

    // --- createTenant without a room (FR-13): PG membership only ---
    const rahul = field<TenantShape>(
      await exec(
        CREATE_TENANT,
        {
          input: {
            userId: rahulUser.id,
            pgId: alpha.id,
            name: ' Rahul Verma ',
            phone: '9800000001',
            emergencyContact: 'Anita Verma 9800000099',
            joinDate: '2026-09-01'
          }
        },
        asAdmin
      ),
      'createTenant'
    );
    check('createTenant trims the name', rahul.name, 'Rahul Verma');
    check('createTenant stores the phone', rahul.phone, '9800000001');
    check('createTenant stores the emergency contact', rahul.emergencyContact, 'Anita Verma 9800000099');
    check('createTenant stores the join date', rahul.joinDate, '2026-09-01');
    check('createTenant links the user', rahul.user?.email, NAMED_EMAILS[0]);
    check('createTenant links the PG', rahul.pg?.id, alpha.id);
    check('createTenant has no room yet', rahul.room, null);
    check('createTenant serializes createdAt as a string', typeof rahul.createdAt, 'string');
    check('creating a tenant without a room leaves occupancy untouched', await occupancyOf(alpha.id, 'A-101'), 0);

    // --- one tenant record per user (User 1 ─ 0..1 Tenant) ---
    expectError(
      'createTenant rejects a user who already has a tenant record',
      await exec(
        CREATE_TENANT,
        { input: { userId: rahulUser.id, pgId: alpha.id, name: 'Duplicate' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );

    // --- createTenant with a room (FR-16: occupancy advances atomically) ---
    const priya = field<TenantShape>(
      await exec(
        CREATE_TENANT,
        {
          input: {
            userId: priyaUser.id,
            pgId: alpha.id,
            roomId: a101.id,
            name: 'Priya Sharma',
            joinDate: '2026-09-05'
          }
        },
        asAdmin
      ),
      'createTenant'
    );
    check('createTenant assigns the room', priya.room?.roomNumber, 'A-101');
    check('the response carries the incremented occupancy', priya.room?.occupiedCount, 1);
    check('createTenant advanced the room occupancy', await occupancyOf(alpha.id, 'A-101'), 1);

    // --- updateTenant: scalar fields (FR-14) ---
    expectError(
      'updateTenant rejects an unknown id',
      await exec(UPDATE_TENANT, { id: NONEXISTENT_ID, input: { name: 'Nobody' } }, asAdmin),
      'NOT_FOUND'
    );
    const renamed = field<TenantShape>(
      await exec(
        UPDATE_TENANT,
        { id: rahul.id, input: { name: 'Rahul V. Verma', phone: '9800000002' } },
        asAdmin
      ),
      'updateTenant'
    );
    check('updateTenant applies the rename', renamed.name, 'Rahul V. Verma');
    check('updateTenant applies the phone change', renamed.phone, '9800000002');
    const cleared = field<TenantShape>(
      await exec(
        UPDATE_TENANT,
        { id: rahul.id, input: { phone: '', joinDate: '' } },
        asAdmin
      ),
      'updateTenant'
    );
    check('updateTenant clears the phone with an empty string', cleared.phone, null);
    check('updateTenant clears the join date with an empty string', cleared.joinDate, null);
    check('updateTenant leaves the name untouched', cleared.name, 'Rahul V. Verma');
    check('scalar updates leave occupancy untouched', await occupancyOf(alpha.id, 'A-101'), 1);

    // --- assign a room to a PG-only tenant (FR-16) ---
    const assigned = field<TenantShape>(
      await exec(UPDATE_TENANT, { id: rahul.id, input: { roomId: a101.id } }, asAdmin),
      'updateTenant'
    );
    check('updateTenant assigns the room', assigned.room?.roomNumber, 'A-101');
    check('the assignment response carries the incremented occupancy', assigned.room?.occupiedCount, 2);
    check('the room is now full at capacity 2', await occupancyOf(alpha.id, 'A-101'), 2);

    // --- capacity is enforced (FR-15): A-101 is full at 2/2 ---
    expectError(
      'createTenant rejects a room that is full',
      await exec(
        CREATE_TENANT,
        { input: { userId: arjunUser.id, pgId: alpha.id, roomId: a101.id, name: 'Arjun Patel' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );

    // --- unassign (roomId: '' releases the bed, FR-16) ---
    const unassigned = field<TenantShape>(
      await exec(UPDATE_TENANT, { id: rahul.id, input: { roomId: '' } }, asAdmin),
      'updateTenant'
    );
    check('updateTenant unassigns the room', unassigned.room, null);
    check('unassigning decrements the occupancy', await occupancyOf(alpha.id, 'A-101'), 1);

    // --- assignment must stay inside the tenant's PG (FR-15) ---
    expectError(
      'updateTenant rejects assigning a room that belongs to another PG',
      await exec(UPDATE_TENANT, { id: rahul.id, input: { roomId: b201.id } }, asAdmin),
      'BAD_USER_INPUT'
    );

    // --- reassign (FR-16: decrement + increment commit together) ---
    const moved = field<TenantShape>(
      await exec(UPDATE_TENANT, { id: priya.id, input: { roomId: a103.id } }, asAdmin),
      'updateTenant'
    );
    check('updateTenant reassigns the room', moved.room?.roomNumber, 'A-103');
    check('the old room is released', await occupancyOf(alpha.id, 'A-101'), 0);
    check('the new room gains the tenant', await occupancyOf(alpha.id, 'A-103'), 1);

    // --- reassigning to the same room is a safe no-op ---
    const sameRoom = field<TenantShape>(
      await exec(UPDATE_TENANT, { id: priya.id, input: { roomId: a103.id } }, asAdmin),
      'updateTenant'
    );
    check('same-room reassignment keeps the room', sameRoom.room?.roomNumber, 'A-103');
    check('same-room reassignment changes no occupancy', await occupancyOf(alpha.id, 'A-103'), 1);

    // --- PG moves require an explicit room decision ---
    expectError(
      'updateTenant rejects a PG move while a room is silently kept',
      await exec(UPDATE_TENANT, { id: priya.id, input: { pgId: beta.id } }, asAdmin),
      'BAD_USER_INPUT'
    );
    const movedPg = field<TenantShape>(
      await exec(
        UPDATE_TENANT,
        { id: priya.id, input: { pgId: beta.id, roomId: b201.id } },
        asAdmin
      ),
      'updateTenant'
    );
    check('the tenant now belongs to the new PG', movedPg.pg?.id, beta.id);
    check('the tenant occupies a room in the new PG', movedPg.room?.roomNumber, 'B-201');
    check('the old-PG room is released on the PG move', await occupancyOf(alpha.id, 'A-103'), 0);
    check('the new-PG room gains the tenant', await occupancyOf(beta.id, 'B-201'), 1);

    // --- PG move with an explicit room clear (roomId: null) ---
    const arjun = field<TenantShape>(
      await exec(
        CREATE_TENANT,
        { input: { userId: arjunUser.id, pgId: alpha.id, roomId: a103.id, name: 'Arjun Patel' } },
        asAdmin
      ),
      'createTenant'
    );
    check('arjun is placed in A-103', await occupancyOf(alpha.id, 'A-103'), 1);
    const arjunMoved = field<TenantShape>(
      await exec(UPDATE_TENANT, { id: arjun.id, input: { pgId: beta.id, roomId: null } }, asAdmin),
      'updateTenant'
    );
    check('the PG move with a cleared room succeeds', arjunMoved.pg?.id, beta.id);
    check('clearing the room on the PG move releases it', arjunMoved.room, null);
    check('A-103 is empty after the PG move', await occupancyOf(alpha.id, 'A-103'), 0);

    // --- empty-string PG id means "keep the current PG" ---
    const noopPg = field<TenantShape>(
      await exec(UPDATE_TENANT, { id: arjun.id, input: { pgId: '', name: 'Arjun P. Patel' } }, asAdmin),
      'updateTenant'
    );
    check('an empty PG id keeps the current PG', noopPg.pg?.id, beta.id);
    check('the name still updates', noopPg.name, 'Arjun P. Patel');

    // --- user re-linking (FR-15: validate user relationships on update) ---
    const neha = field<TenantShape>(
      await exec(
        CREATE_TENANT,
        { input: { userId: nehaUser.id, pgId: alpha.id, name: 'Neha Singh' } },
        asAdmin
      ),
      'createTenant'
    );
    expectError(
      'updateTenant rejects relinking to a user who already has a tenant record',
      await exec(UPDATE_TENANT, { id: neha.id, input: { userId: priyaUser.id } }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'updateTenant rejects relinking to an Admin-role user',
      await exec(UPDATE_TENANT, { id: neha.id, input: { userId: admin.id } }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'updateTenant rejects relinking to an unknown user',
      await exec(UPDATE_TENANT, { id: neha.id, input: { userId: NONEXISTENT_ID } }, asAdmin),
      'BAD_USER_INPUT'
    );
    const relinked = field<TenantShape>(
      await exec(UPDATE_TENANT, { id: neha.id, input: { userId: linkUser.id } }, asAdmin),
      'updateTenant'
    );
    check('updateTenant relinks the user', relinked.user?.email, LINK_EMAIL);
    const reaffirmed = field<TenantShape>(
      await exec(UPDATE_TENANT, { id: neha.id, input: { userId: linkUser.id } }, asAdmin),
      'updateTenant'
    );
    check('relinking to the same user is a no-op', reaffirmed.user?.email, LINK_EMAIL);
    check('user relinking never touches occupancy', await occupancyOf(alpha.id, 'A-101'), 0);

    // --- concurrency: two admins race for the last bed of A-102 (FR-35) ---
    check('the race room starts empty', await occupancyOf(alpha.id, 'A-102'), 0);
    const raceResults = await Promise.all([
      exec(
        CREATE_TENANT,
        { input: { userId: racerA.id, pgId: alpha.id, roomId: a102.id, name: 'Race Tenant A' } },
        asAdmin
      ),
      exec(
        CREATE_TENANT,
        { input: { userId: racerB.id, pgId: alpha.id, roomId: a102.id, name: 'Race Tenant B' } },
        asAdmin
      )
    ]);
    const raceSuccesses = raceResults.filter((result) => succeeded(result, 'createTenant'));
    check('the last-bed race admits exactly one tenant', raceSuccesses.length, 1);
    const raceFailure = raceResults.find((result) => !succeeded(result, 'createTenant'));
    if (!raceFailure) throw new Error('FAIL race: expected one createTenant to fail');
    expectError('the race loser receives a friendly error', raceFailure, 'BAD_USER_INPUT');
    const raceMessage = raceFailure.errors?.[0]?.message ?? '';
    if (!raceMessage.toLowerCase().includes('full')) {
      throw new Error(`FAIL race loser message should mention the full room, got: "${raceMessage}"`);
    }
    console.log('PASS: the race loser message mentions the full room');
    check('the race room ended at exactly its capacity', await occupancyOf(alpha.id, 'A-102'), 1);
    const loserIsA = !succeeded(raceResults[0], 'createTenant');
    const loserUser = loserIsA ? racerA : racerB;
    const loserTenantCount = await AppDataSource.getRepository(Tenant).count({
      where: { user: { id: loserUser.id } }
    });
    check('the race loser has no tenant record (rollback)', loserTenantCount, 0);

    // --- capacity is enforced on updates too (FR-15): A-102 is full at 1/1 ---
    expectError(
      'updateTenant rejects a room that is full',
      await exec(UPDATE_TENANT, { id: rahul.id, input: { roomId: a102.id } }, asAdmin),
      'BAD_USER_INPUT'
    );

    // --- pagination + search (FR-12-consistent behavior, MRD §16) ---
    const bulkInput = (user: User, i: number) => ({
      userId: user.id,
      pgId: alpha.id,
      name: `Bulk Tenant ${String(i + 1).padStart(2, '0')}`,
      ...(i === 2 ? { phone: '9876500003' } : {}) // bulk03 is searchable by phone
    });
    for (let i = 0; i < bulkUsers.length; i += 1) {
      const created = field<TenantShape>(
        await exec(CREATE_TENANT, { input: bulkInput(bulkUsers[i], i) }, asAdmin),
        'createTenant'
      );
      check(`bulk tenant ${i + 1} lands in the right PG`, created.pg?.id, alpha.id);
    }

    // Alpha now holds: rahul, neha, one race winner, 8 bulk tenants = 11.
    const alphaPage = field<TenantPageShape>(
      await exec(GET_ALL_TENANTS, { pgId: alpha.id, limit: 5, offset: 0 }, asAdmin),
      'getAllTenants'
    );
    check('getAllTenants paginates items', alphaPage.items.length, 5);
    check('getAllTenants reports the total', alphaPage.total, 11);
    check('getAllTenants echoes limit/offset', `${alphaPage.limit}/${alphaPage.offset}`, '5/0');
    check(
      'getAllTenants lists newest tenants first',
      alphaPage.items.every((item) => item.name.startsWith('Bulk')),
      true
    );
    const alphaTail = field<TenantPageShape>(
      await exec(GET_ALL_TENANTS, { pgId: alpha.id, limit: 5, offset: 10 }, asAdmin),
      'getAllTenants'
    );
    check('getAllTenants returns the final partial page', alphaTail.items.length, 1);
    const betaPage = field<TenantPageShape>(
      await exec(GET_ALL_TENANTS, { pgId: beta.id }, asAdmin),
      'getAllTenants'
    );
    check('the PG filter scopes the tenant list', betaPage.total, 2);

    const byName = field<TenantPageShape>(
      await exec(GET_ALL_TENANTS, { pgId: alpha.id, search: 'Bulk' }, asAdmin),
      'getAllTenants'
    );
    check('search matches tenant names', byName.total, 8);
    const byNameLower = field<TenantPageShape>(
      await exec(GET_ALL_TENANTS, { pgId: alpha.id, search: 'bulk' }, asAdmin),
      'getAllTenants'
    );
    check('tenant search is case-insensitive', byNameLower.total, 8);
    const byEmail = field<TenantPageShape>(
      await exec(GET_ALL_TENANTS, { pgId: alpha.id, search: 'phase5.bulk03' }, asAdmin),
      'getAllTenants'
    );
    check('search matches the linked user email', byEmail.total, 1);
    check('the email search finds the right tenant', byEmail.items[0]?.name, 'Bulk Tenant 03');
    const byPhone = field<TenantPageShape>(
      await exec(GET_ALL_TENANTS, { pgId: alpha.id, search: '9876500003' }, asAdmin),
      'getAllTenants'
    );
    check('search matches the tenant phone', byPhone.total, 1);
    const searchMiss = field<TenantPageShape>(
      await exec(GET_ALL_TENANTS, { pgId: alpha.id, search: 'no-such-tenant' }, asAdmin),
      'getAllTenants'
    );
    check('search can return an empty page', searchMiss.items.length, 0);

    expectError(
      'getAllTenants rejects limit 0',
      await exec(GET_ALL_TENANTS, { limit: 0 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'getAllTenants rejects limit above the max',
      await exec(GET_ALL_TENANTS, { limit: 101 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'getAllTenants rejects a negative offset',
      await exec(GET_ALL_TENANTS, { offset: -1 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'getAllTenants rejects an unknown pgId filter',
      await exec(GET_ALL_TENANTS, { pgId: NONEXISTENT_ID }, asAdmin),
      'BAD_USER_INPUT'
    );
    const defaultLimit = field<TenantPageShape>(
      await exec(GET_ALL_TENANTS, { limit: 3 }, asAdmin),
      'getAllTenants'
    );
    check('getAllTenants respects the requested limit', defaultLimit.items.length <= 3, true);
    check('getAllTenants echoes the limit', defaultLimit.limit, 3);

    // --- nested resolution through the relation field resolvers ---
    const deepTenant = field<{ items: DeepTenantShape[] }>(
      await exec(GET_ALL_TENANTS_DEEP, { search: 'Rahul', pgId: alpha.id }, asAdmin),
      'getAllTenants'
    );
    const rahulDeep = deepTenant.items[0];
    if (!rahulDeep) throw new Error('Deep tenant query returned no items for Rahul');
    check('the tenant resolves its user', rahulDeep.user.email, NAMED_EMAILS[0]);
    check('the user resolves back to the same tenant', rahulDeep.user.tenant?.id, rahulDeep.id);
    check('the tenant resolves its PG', rahulDeep.pg.name, TEST_PG_NAMES[0]);
    check('the PG resolves its rooms', rahulDeep.pg.rooms.length, 3);

    // Rahul is reassigned to A-101 (also proves assign-after-unassign).
    const rahulBack = field<TenantShape>(
      await exec(UPDATE_TENANT, { id: rahul.id, input: { roomId: a101.id } }, asAdmin),
      'updateTenant'
    );
    check('the reassignment to A-101 succeeds', rahulBack.room?.roomNumber, 'A-101');
    check('A-101 gains the tenant back', await occupancyOf(alpha.id, 'A-101'), 1);

    const deepAgain = field<{ items: DeepTenantShape[] }>(
      await exec(GET_ALL_TENANTS_DEEP, { search: 'Rahul', pgId: alpha.id }, asAdmin),
      'getAllTenants'
    );
    const withRoom = deepAgain.items[0];
    if (!withRoom) throw new Error('Deep tenant query returned no items for Rahul');
    check('the tenant resolves its room', withRoom.room?.roomNumber, 'A-101');
    check('the room resolves its own PG', withRoom.room?.pg.name, TEST_PG_NAMES[0]);

    const deepRooms = field<{ items: DeepRoomShape[] }>(
      await exec(GET_ALL_ROOMS_DEEP, { search: 'A-101', pgId: alpha.id }, asAdmin),
      'getAllRooms'
    );
    const roomTenant = deepRooms.items[0]?.tenants.find((tenant) => tenant.user.email === NAMED_EMAILS[0]);
    if (!roomTenant) throw new Error('A-101 did not resolve Rahul through Room.tenants');
    check('the room resolves its assigned tenant', roomTenant.name, 'Rahul V. Verma');
    check('the room tenant resolves its PG', roomTenant.pg.name, TEST_PG_NAMES[0]);

    // --- tenant-facing query (FR-17): the admin's assignment is what the tenant sees ---
    expectError(
      'getTenantPgRoom requires the Tenant role',
      await exec(GET_TENANT_PG_ROOM, {}, asAdmin),
      'FORBIDDEN'
    );
    const rahulView = field<TenantPgRoomShape>(
      await exec(GET_TENANT_PG_ROOM, {}, asTenant(rahulUser)),
      'getTenantPgRoom'
    );
    check("the tenant sees the assigned PG", rahulView.pg.id, alpha.id);
    check('the tenant sees the assigned room', rahulView.room.roomNumber, 'A-101');
    // The race loser never got a tenant record — a valid "not assigned yet" state.
    const loserView = await exec(GET_TENANT_PG_ROOM, {}, asTenant(loserUser));
    check('a user without a tenant record gets null', loserView.data?.getTenantPgRoom ?? null, null);

    // --- occupancy integrity sweep: occupiedCount == assigned tenant count ---
    const roomRepo = AppDataSource.getRepository(Room);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const testRooms = await roomRepo.find({
      where: TEST_PG_NAMES.map((name) => ({ pg: { name } }))
    });
    if (testRooms.length !== 4) {
      throw new Error(`Expected 4 test rooms for the integrity sweep, found ${testRooms.length}`);
    }
    for (const room of testRooms) {
      const assigned = await tenantRepo.count({ where: { room: { id: room.id } } });
      check(
        `occupancy integrity for room ${room.roomNumber}`,
        room.occupiedCount,
        assigned
      );
    }

    console.log('\nAll Phase 5 tenant management checks passed.');
  } finally {
    await cleanupTestData();
    await server.stop();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Phase 5 verification FAILED:', error);
  process.exit(1);
});
