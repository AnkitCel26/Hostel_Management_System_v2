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

const TEST_ADMIN_EMAIL = 'phase4.admin@hostel.test';
const TEST_TENANT_EMAIL = 'phase4.tenant@hostel.test';
const TEST_PASSWORD = 'phase4-verify-password';
// The first PG is renamed during the run, so cleanup must know both names.
const TEST_PG_NAMES = ['Phase4 Verify PG', 'Phase4 Verify PG Updated', 'Phase4 Verify PG Two'];
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

interface GqlResult {
  data: Record<string, unknown> | null;
  errors?: readonly GraphQLFormattedError[];
}

interface PgShape {
  id: string;
  name: string;
  address: string;
  city?: string | null;
  createdAt?: string;
  rooms?: RoomShape[];
}

interface RoomShape {
  id: string;
  roomNumber: string;
  roomType?: string | null;
  capacity: number;
  occupiedCount: number;
  rent: number;
  floor?: number | null;
  pg?: { id: string; name?: string };
}

interface RoomPageShape {
  total: number;
  limit: number;
  offset: number;
  items: RoomShape[];
}

interface TenantPgRoomShape {
  pg: { id: string; name: string };
  room: { id: string; roomNumber: string };
}

interface DeepRoomShape {
  id: string;
  tenants: {
    name: string;
    user: { email: string };
    pg: { id: string; name: string };
  }[];
}

const CREATE_PG = `
  mutation CreatePg($input: CreatePgInput!) {
    createPg(input: $input) { id name address city contactNumber description createdAt updatedAt }
  }`;

const UPDATE_PG = `
  mutation UpdatePg($id: ID!, $input: UpdatePgInput!) {
    updatePg(id: $id, input: $input) { id name address city }
  }`;

const GET_ALL_PGS = `
  query GetAllPgs {
    getAllPgs { id name createdAt }
  }`;

const GET_ALL_PGS_ROOMS = `
  query GetAllPgsRooms {
    getAllPgsRooms {
      id name
      rooms {
        id roomNumber
        pg { id name }
        tenants { name user { email } pg { id } }
      }
    }
  }`;

const CREATE_ROOM = `
  mutation CreateRoom($input: CreateRoomInput!) {
    createRoom(input: $input) {
      id roomNumber roomType capacity occupiedCount rent floor pg { id name } createdAt
    }
  }`;

const UPDATE_ROOM = `
  mutation UpdateRoom($id: ID!, $input: UpdateRoomInput!) {
    updateRoom(id: $id, input: $input) {
      id roomNumber roomType capacity occupiedCount rent floor
    }
  }`;

const GET_ALL_ROOMS = `
  query GetAllRooms($search: String, $pgId: ID, $limit: Int, $offset: Int) {
    getAllRooms(search: $search, pgId: $pgId, limit: $limit, offset: $offset) {
      total limit offset
      items { id roomNumber roomType capacity occupiedCount rent floor pg { id name } createdAt }
    }
  }`;

const GET_ALL_ROOMS_DEEP = `
  query GetAllRoomsDeep($search: String, $pgId: ID) {
    getAllRooms(search: $search, pgId: $pgId) {
      items { id tenants { id name user { email } pg { id name } } }
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

/** Removes any data left over from a previous (or partial) run, in FK-safe order. */
async function cleanupTestData(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const pgRepo = AppDataSource.getRepository(Pg);
  const roomRepo = AppDataSource.getRepository(Room);

  const users = await userRepo.find({
    where: { email: In([TEST_ADMIN_EMAIL, TEST_TENANT_EMAIL]) }
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

    const userRepo = AppDataSource.getRepository(User);
    const admin = await userRepo.save(
      userRepo.create({
        name: 'Phase Four Admin',
        email: TEST_ADMIN_EMAIL,
        password: await hashPassword(TEST_PASSWORD),
        role: UserRole.Admin
      })
    );
    const tenantUser = await userRepo.save(
      userRepo.create({
        name: 'Phase Four Tenant',
        email: TEST_TENANT_EMAIL,
        password: await hashPassword(TEST_PASSWORD),
        role: UserRole.Tenant
      })
    );
    const asAdmin: AuthUser = { id: admin.id, role: 'Admin' };
    const asTenant: AuthUser = { id: tenantUser.id, role: 'Tenant' };

    expectError(
      'guest cannot create a PG',
      await exec(CREATE_PG, {
        input: { name: 'Guest PG', address: '1 Nowhere Street' }
      }),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot create a PG',
      await exec(
        CREATE_PG,
        { input: { name: 'Tenant PG', address: '1 Nowhere Street' } },
        asTenant
      ),
      'FORBIDDEN'
    );
    expectError('tenant cannot list PGs', await exec(GET_ALL_PGS, {}, asTenant), 'FORBIDDEN');
    expectError('guest cannot list rooms', await exec(GET_ALL_ROOMS, {}), 'FORBIDDEN');

    expectError(
      'createPg rejects a short name',
      await exec(CREATE_PG, { input: { name: 'x', address: '1 Short Street' } }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'createPg rejects a blank address',
      await exec(
        CREATE_PG,
        { input: { name: 'Valid Name', address: '   ' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );

    const createdPg = field<PgShape>(
      await exec(
        CREATE_PG,
        {
          input: {
            name: ' Phase4 Verify PG ',
            address: ' 12 Phase Four Street ',
            city: 'Testville',
            contactNumber: '9800000000',
            description: 'Temporary PG for Phase 4 verification.'
          }
        },
        asAdmin
      ),
      'createPg'
    );
    const pgId = createdPg.id;
    check('createPg trims the name', createdPg.name, 'Phase4 Verify PG');
    check('createPg trims the address', createdPg.address, '12 Phase Four Street');
    check('createPg serializes createdAt as a string', typeof createdPg.createdAt, 'string');

    expectError(
      'updatePg rejects an unknown id',
      await exec(UPDATE_PG, { id: NONEXISTENT_ID, input: { name: 'Nope' } }, asAdmin),
      'NOT_FOUND'
    );
    const updatedPg = field<PgShape>(
      await exec(
        UPDATE_PG,
        { id: pgId, input: { name: 'Phase4 Verify PG Updated', city: '' } },
        asAdmin
      ),
      'updatePg'
    );
    check('updatePg applies the rename', updatedPg.name, 'Phase4 Verify PG Updated');
    check('updatePg clears the city with an empty string', updatedPg.city, null);

    const allPgs = field<PgShape[]>(await exec(GET_ALL_PGS, {}, asAdmin), 'getAllPgs');
    check('getAllPgs lists the PG newest first', allPgs[0]?.id, pgId);

    const createdRoom = field<RoomShape>(
      await exec(
        CREATE_ROOM,
        {
          input: {
            pgId,
            roomNumber: ' V-101 ',
            roomType: 'double',
            capacity: 2,
            rent: 5500,
            floor: 1
          }
        },
        asAdmin
      ),
      'createRoom'
    );
    const roomId = createdRoom.id;
    check('createRoom trims the room number', createdRoom.roomNumber, 'V-101');
    check('createRoom starts unoccupied', createdRoom.occupiedCount, 0);
    check('createRoom links the room to its PG', createdRoom.pg?.id, pgId);

    expectError(
      'createRoom rejects an unknown PG',
      await exec(
        CREATE_ROOM,
        {
          input: {
            pgId: NONEXISTENT_ID,
            roomNumber: 'V-999',
            capacity: 2,
            rent: 5000
          }
        },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createRoom rejects a duplicate room number in the same PG',
      await exec(
        CREATE_ROOM,
        { input: { pgId, roomNumber: 'V-101', capacity: 2, rent: 5000 } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createRoom rejects zero capacity',
      await exec(
        CREATE_ROOM,
        { input: { pgId, roomNumber: 'V-102', capacity: 0, rent: 5000 } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createRoom rejects a negative rent',
      await exec(
        CREATE_ROOM,
        { input: { pgId, roomNumber: 'V-102', capacity: 2, rent: -1 } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );

    const secondPg = field<PgShape>(
      await exec(
        CREATE_PG,
        {
          input: { name: 'Phase4 Verify PG Two', address: '34 Second Street' }
        },
        asAdmin
      ),
      'createPg'
    );
    const crossPgRoom = field<RoomShape>(
      await exec(
        CREATE_ROOM,
        {
          input: { pgId: secondPg.id, roomNumber: 'V-101', capacity: 3, rent: 6500 }
        },
        asAdmin
      ),
      'createRoom'
    );
    check(
      'createRoom allows the same room number in another PG',
      crossPgRoom.roomNumber,
      'V-101'
    );

    expectError(
      'updateRoom rejects an unknown id',
      await exec(UPDATE_ROOM, { id: NONEXISTENT_ID, input: { rent: 6000 } }, asAdmin),
      'NOT_FOUND'
    );
    const updatedRoom = field<RoomShape>(
      await exec(
        UPDATE_ROOM,
        { id: roomId, input: { rent: 6000, roomType: '' } },
        asAdmin
      ),
      'updateRoom'
    );
    check('updateRoom applies the new rent', updatedRoom.rent, 6000);
    check('updateRoom clears the room type with an empty string', updatedRoom.roomType, null);

    const otherRoom = field<RoomShape>(
      await exec(
        CREATE_ROOM,
        { input: { pgId, roomNumber: 'V-102', capacity: 2, rent: 5000 } },
        asAdmin
      ),
      'createRoom'
    );
    expectError(
      'updateRoom rejects renaming onto a used room number',
      await exec(
        UPDATE_ROOM,
        { id: roomId, input: { roomNumber: 'V-102' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );

    const roomRepo = AppDataSource.getRepository(Room);
    const busyRoom = await roomRepo.findOne({ where: { id: otherRoom.id } });
    if (!busyRoom) throw new Error('Test room not found for the occupancy check');
    busyRoom.occupiedCount = 3;
    await roomRepo.save(busyRoom);

    expectError(
      'updateRoom cannot set capacity below current occupancy',
      await exec(UPDATE_ROOM, { id: otherRoom.id, input: { capacity: 2 } }, asAdmin),
      'BAD_USER_INPUT'
    );
    const widenedRoom = field<RoomShape>(
      await exec(UPDATE_ROOM, { id: otherRoom.id, input: { capacity: 4 } }, asAdmin),
      'updateRoom'
    );
    check('updateRoom allows capacity at or above occupancy', widenedRoom.capacity, 4);

    let firstBatchRoomId: string | null = null;
    for (let i = 1; i <= 25; i += 1) {
      const roomNumber = `R-${String(i).padStart(2, '0')}`;
      const created = field<RoomShape>(
        await exec(
          CREATE_ROOM,
          { input: { pgId: secondPg.id, roomNumber, capacity: 2, rent: 5000 } },
          asAdmin
        ),
        'createRoom'
      );
      if (i === 1) {
        firstBatchRoomId = created.id;
      }
    }
    const firstPage = field<RoomPageShape>(
      await exec(GET_ALL_ROOMS, { pgId: secondPg.id, limit: 10, offset: 0 }, asAdmin),
      'getAllRooms'
    );
    check('getAllRooms paginates items', firstPage.items.length, 10);
    check('getAllRooms reports the total', firstPage.total, 26);
    check('getAllRooms echoes limit/offset', `${firstPage.limit}/${firstPage.offset}`, '10/0');

    const lastPage = field<RoomPageShape>(
      await exec(GET_ALL_ROOMS, { pgId: secondPg.id, limit: 10, offset: 20 }, asAdmin),
      'getAllRooms'
    );
    check('getAllRooms returns the final partial page', lastPage.items.length, 6);

    const searchHit = field<RoomPageShape>(
      await exec(GET_ALL_ROOMS, { pgId: secondPg.id, search: 'v-101' }, asAdmin),
      'getAllRooms'
    );
    check(
      'getAllRooms search is case-insensitive on room number',
      searchHit.items.length,
      1
    );
    check('getAllRooms search finds the right room', searchHit.items[0]?.roomNumber, 'V-101');

    const searchMiss = field<RoomPageShape>(
      await exec(GET_ALL_ROOMS, { search: 'no-such-room' }, asAdmin),
      'getAllRooms'
    );
    check('getAllRooms search can return an empty page', searchMiss.items.length, 0);

    if (!firstBatchRoomId) throw new Error('Batch room id was not captured');
    await exec(
      UPDATE_ROOM,
      { id: firstBatchRoomId, input: { roomType: 'deluxe' } },
      asAdmin
    );
    const typeSearch = field<RoomPageShape>(
      await exec(GET_ALL_ROOMS, { search: 'deluxe' }, asAdmin),
      'getAllRooms'
    );
    check('getAllRooms search matches the room type', typeSearch.items.length, 1);
    check(
      'getAllRooms room type search finds the right room',
      typeSearch.items[0]?.id,
      firstBatchRoomId
    );

    expectError(
      'getAllRooms rejects limit 0',
      await exec(GET_ALL_ROOMS, { limit: 0 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'getAllRooms rejects limit above the max',
      await exec(GET_ALL_ROOMS, { limit: 101 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'getAllRooms rejects a negative offset',
      await exec(GET_ALL_ROOMS, { offset: -1 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'getAllRooms rejects an unknown pgId filter',
      await exec(GET_ALL_ROOMS, { pgId: NONEXISTENT_ID }, asAdmin),
      'BAD_USER_INPUT'
    );

    const pgsWithRooms = field<PgShape[]>(
      await exec(GET_ALL_PGS_ROOMS, {}, asAdmin),
      'getAllPgsRooms'
    );
    const pgWithTenant = pgsWithRooms.find((pg) => pg.id === pgId);
    const nestedRoom = pgWithTenant?.rooms?.find((room) => room.id === roomId);
    check(
      'getAllPgsRooms nests rooms under the PG',
      pgWithTenant?.rooms?.length,
      2
    );
    check('nested room resolves its PG', nestedRoom?.pg?.name, 'Phase4 Verify PG Updated');

    expectError(
      'getTenantPgRoom requires the Tenant role',
      await exec(GET_TENANT_PG_ROOM, {}, asAdmin),
      'FORBIDDEN'
    );
    const beforeAssignment = await exec(GET_TENANT_PG_ROOM, {}, asTenant);
    check(
      'getTenantPgRoom is null before a tenant record exists',
      beforeAssignment.data?.getTenantPgRoom ?? null,
      null
    );

    const tenantRepo = AppDataSource.getRepository(Tenant);
    const pgEntity = await AppDataSource.getRepository(Pg).findOne({ where: { id: pgId } });
    const roomEntity = await roomRepo.findOne({ where: { id: roomId } });
    if (!pgEntity || !roomEntity) throw new Error('Test PG/room not found for tenant setup');
    await tenantRepo.save(
      tenantRepo.create({
        user: tenantUser,
        pg: pgEntity,
        room: roomEntity,
        name: 'Phase Four Tenant',
        joinDate: '2026-09-01'
      })
    );

    const assignment = field<TenantPgRoomShape>(
      await exec(GET_TENANT_PG_ROOM, {}, asTenant),
      'getTenantPgRoom'
    );
    check('getTenantPgRoom returns the assigned PG', assignment.pg.id, pgId);
    check('getTenantPgRoom returns the assigned room', assignment.room.id, roomId);

    const deepRooms = field<{ items: DeepRoomShape[] }>(
      await exec(GET_ALL_ROOMS_DEEP, { search: 'V-101', pgId }, asAdmin),
      'getAllRooms'
    );
    const deepTenant = deepRooms.items[0]?.tenants[0];
    check('room resolves its tenants', deepTenant?.name, 'Phase Four Tenant');
    check('tenant resolves its user', deepTenant?.user.email, TEST_TENANT_EMAIL);
    check('tenant resolves its PG', deepTenant?.pg.id, pgId);

    console.log('\nAll Phase 4 PG/room management checks passed.');
  } finally {
    await cleanupTestData();
    await server.stop();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Phase 4 verification FAILED:', error);
  process.exit(1);
});
