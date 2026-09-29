/**
 * Phase 6 verification: exercises rent and payment management through the
 * real GraphQL layer (same typeDefs/resolvers the Express app serves) —
 * authorization, input validation, status derivation (pending/partial/paid/
 * overdue, including the live-status rule where a stored status goes stale),
 * paidDate system-management, searchable/filterable/paginated payment
 * listing, tenant-scoped history, admin summary math, admin history, nested
 * resolution, concurrent updates of one payment, and a write-invariant
 * integrity sweep. Creates throwaway data and cleans up.
 *
 * Run: npx ts-node --transpile-only src/scripts/verifyPhase6.ts
 */
import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import type { Request, Response } from 'express';
import { GraphQLFormattedError } from 'graphql';
import { In } from 'typeorm';

import { AppDataSource } from '../config/db';
import { Pg } from '../entities/pg.entity';
import { PaymentStatus, RentPayment } from '../entities/rent_payment.entity';
import { Room } from '../entities/room.entity';
import { Tenant } from '../entities/tenant.entity';
import { User, UserRole } from '../entities/user.entity';
import { resolvers } from '../graphql/resolvers';
import { typeDefs } from '../graphql/typeDefs';
import type { AuthUser } from '../types';
import { hashPassword } from '../utils/password';

const TEST_ADMIN_EMAIL = 'phase6.admin@hostel.test';
const TEST_PASSWORD = 'phase6-verify-password';
const TEST_PG_NAMES = ['Phase6 Verify PG Alpha', 'Phase6 Verify PG Beta'];
const TENANT_EMAILS = [
  'phase6.rahul@hostel.test',
  'phase6.priya@hostel.test',
  'phase6.cross@hostel.test'
];
const ROOMLESS_EMAIL = 'phase6.roomless@hostel.test';
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
  room?: { id: string; roomNumber: string } | null;
}

interface PaymentShape {
  id: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  paidDate?: string | null;
  status: string;
  notes?: string | null;
  tenant?: { id: string; name: string; pg?: { name: string } };
}

interface PaymentPageShape {
  total: number;
  limit: number;
  offset: number;
  items: PaymentShape[];
}

interface SummaryShape {
  totalPayments: number;
  totalBilled: number;
  totalCollected: number;
  outstandingAmount: number;
  pendingCount: number;
  partialCount: number;
  paidCount: number;
  overdueCount: number;
}

interface DeepPaymentShape {
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

const CREATE_PAYMENT = `
  mutation CreateRentPayment($input: CreateRentPaymentInput!) {
    createRentPayment(input: $input) {
      id amount paidAmount dueDate paidDate status notes
      tenant { id name }
    }
  }`;

const UPDATE_PAYMENT = `
  mutation UpdateRentPayment($id: ID!, $input: UpdateRentPaymentInput!) {
    updateRentPayment(id: $id, input: $input) {
      id amount paidAmount dueDate paidDate status notes
      tenant { id name user { email } }
    }
  }`;

const GET_PAYMENTS = `
  query GetAllRentPayments($search: String, $pgId: ID, $tenantId: ID, $status: PaymentStatus, $limit: Int, $offset: Int) {
    getAllRentPayments(search: $search, pgId: $pgId, tenantId: $tenantId, status: $status, limit: $limit, offset: $offset) {
      total limit offset
      items { id amount paidAmount dueDate paidDate status notes tenant { id name } }
    }
  }`;

const GET_PAYMENTS_DEEP = `
  query GetAllRentPaymentsDeep($search: String) {
    getAllRentPayments(search: $search) {
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

const GET_SUMMARY = `
  query GetAdminRentSummary($pgId: ID) {
    getAdminRentSummary(pgId: $pgId) {
      totalPayments totalBilled totalCollected outstandingAmount
      pendingCount partialCount paidCount overdueCount
    }
  }`;

const GET_TENANT_HISTORY = `
  query GetRentPaymentHistory($limit: Int, $offset: Int) {
    getRentPaymentHistory(limit: $limit, offset: $offset) {
      total limit offset
      items { id amount paidAmount dueDate paidDate status notes tenant { id name } }
    }
  }`;

const GET_ADMIN_HISTORY = `
  query GetAdminRentHistory($limit: Int, $offset: Int) {
    getAdminRentHistory(limit: $limit, offset: $offset) {
      total limit offset
      items { id amount paidAmount status tenant { id name pg { name } } }
    }
  }`;

const GET_TENANTS_PAYMENTS = `
  query GetAllTenantsPayments($search: String) {
    getAllTenants(search: $search) {
      items { id name payments { id amount paidAmount status } }
    }
  }`;

/** Calendar date offset from today (UTC), as YYYY-MM-DD. */
function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

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
  const paymentRepo = AppDataSource.getRepository(RentPayment);

  const users = await userRepo.find({
    where: { email: In(TEST_USER_EMAILS) }
  });
  if (users.length > 0) {
    const tenants = await tenantRepo.find({
      where: users.map((user) => ({ user: { id: user.id } }))
    });
    if (tenants.length > 0) {
      // Payments reference tenants — delete them before their tenants.
      await paymentRepo
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

  const TODAY = isoDate(0);
  const FUTURE = isoDate(7);
  const YESTERDAY = isoDate(-1);
  const PAST = isoDate(-30);
  const RECENT = isoDate(-8);

  try {
    await cleanupTestData();

    // --- throwaway users (auth flows are Phase 3 and already verified) ---
    const userRepo = AppDataSource.getRepository(User);
    const admin = await userRepo.save(
      userRepo.create({
        name: 'Phase Six Admin',
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
    const rahul = await createTenantViaGql(rahulUser.id, alpha.id, 'Rahul Verma', a101.id);
    const priya = await createTenantViaGql(priyaUser.id, alpha.id, 'Priya Sharma');
    const cross = await createTenantViaGql(crossUser.id, beta.id, 'Cross Pg Tenant');

    const createPayment = async (input: Record<string, unknown>): Promise<PaymentShape> =>
      field<PaymentShape>(
        await exec(CREATE_PAYMENT, { input }, asAdmin),
        'createRentPayment'
      );

    // --- authorization (FR-33: both roles guarded at the resolver) ---
    expectError('guest cannot list payments', await exec(GET_PAYMENTS, {}), 'FORBIDDEN');
    expectError('guest cannot read the summary', await exec(GET_SUMMARY, {}), 'FORBIDDEN');
    expectError('guest cannot read the admin history', await exec(GET_ADMIN_HISTORY, {}), 'FORBIDDEN');
    expectError('guest cannot read the tenant history', await exec(GET_TENANT_HISTORY, {}), 'FORBIDDEN');
    expectError(
      'tenant cannot list payments',
      await exec(GET_PAYMENTS, {}, asTenant(rahulUser)),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot read the summary',
      await exec(GET_SUMMARY, {}, asTenant(rahulUser)),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot read the admin history',
      await exec(GET_ADMIN_HISTORY, {}, asTenant(rahulUser)),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot create a payment',
      await exec(
        CREATE_PAYMENT,
        { input: { tenantId: rahul.id, amount: 5000, dueDate: FUTURE } },
        asTenant(rahulUser)
      ),
      'FORBIDDEN'
    );
    expectError(
      'tenant cannot update a payment',
      await exec(
        UPDATE_PAYMENT,
        { id: NONEXISTENT_ID, input: { paidAmount: 100 } },
        asTenant(rahulUser)
      ),
      'FORBIDDEN'
    );
    expectError(
      'admin cannot read the tenant history',
      await exec(GET_TENANT_HISTORY, {}, asAdmin),
      'FORBIDDEN'
    );

    // --- createRentPayment validation (FR-18) ---
    expectError(
      'createRentPayment rejects an unknown tenant',
      await exec(
        CREATE_PAYMENT,
        { input: { tenantId: NONEXISTENT_ID, amount: 5000, dueDate: FUTURE } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createRentPayment rejects a zero amount',
      await exec(CREATE_PAYMENT, { input: { tenantId: rahul.id, amount: 0, dueDate: FUTURE } }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'createRentPayment rejects a negative paidAmount',
      await exec(
        CREATE_PAYMENT,
        { input: { tenantId: rahul.id, amount: 5000, paidAmount: -1, dueDate: FUTURE } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createRentPayment rejects paidAmount above the amount',
      await exec(
        CREATE_PAYMENT,
        { input: { tenantId: rahul.id, amount: 5000, paidAmount: 5001, dueDate: FUTURE } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createRentPayment rejects a malformed due date',
      await exec(
        CREATE_PAYMENT,
        { input: { tenantId: rahul.id, amount: 5000, dueDate: '30-09-2026' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createRentPayment rejects an impossible calendar date',
      await exec(
        CREATE_PAYMENT,
        { input: { tenantId: rahul.id, amount: 5000, dueDate: '2026-02-30' } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createRentPayment rejects a future paid date',
      await exec(
        CREATE_PAYMENT,
        { input: { tenantId: rahul.id, amount: 5000, paidAmount: 5000, dueDate: FUTURE, paidDate: isoDate(1) } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createRentPayment rejects a paid date on a partial payment',
      await exec(
        CREATE_PAYMENT,
        { input: { tenantId: rahul.id, amount: 8000, paidAmount: 3000, dueDate: FUTURE, paidDate: YESTERDAY } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'createRentPayment rejects over-long notes',
      await exec(
        CREATE_PAYMENT,
        { input: { tenantId: rahul.id, amount: 5000, dueDate: FUTURE, notes: 'x'.repeat(2001) } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );

    // --- createRentPayment + status derivation (FR-18, MRD §16) ---
    const p1 = await createPayment({
      tenantId: rahul.id,
      amount: 10000,
      dueDate: FUTURE,
      paidAmount: 0,
      notes: '  Phase6 rent note A-101  '
    });
    check('an unpaid future payment is pending', p1.status, 'pending');
    check('a pending payment has no paid date', p1.paidDate, null);
    check('createRentPayment trims the notes', p1.notes, 'Phase6 rent note A-101');
    check('createRentPayment attaches the tenant', p1.tenant?.id, rahul.id);

    const p2 = await createPayment({ tenantId: rahul.id, amount: 8000, dueDate: FUTURE, paidAmount: 3000 });
    check('a partially paid future payment is partial', p2.status, 'partial');

    const p3 = await createPayment({ tenantId: priya.id, amount: 6000, dueDate: FUTURE, paidAmount: 6000, notes: '' });
    check('a fully paid payment is paid', p3.status, 'paid');
    check('a fully paid payment defaults its paid date to today', p3.paidDate, TODAY);
    check('an empty notes string clears the notes', p3.notes, null);

    const p4 = await createPayment({ tenantId: priya.id, amount: 5000, dueDate: YESTERDAY, paidAmount: 0 });
    check('an unpaid past-due payment is overdue', p4.status, 'overdue');

    const p5 = await createPayment({ tenantId: cross.id, amount: 7000, dueDate: FUTURE });
    check('paidAmount defaults to zero', p5.paidAmount, 0);
    check('the omitted paidAmount leaves the payment pending', p5.status, 'pending');

    const p6 = await createPayment({
      tenantId: rahul.id,
      amount: 9000,
      dueDate: PAST,
      paidAmount: 9000,
      paidDate: RECENT,
      notes: 'Phase6 backdated full payment'
    });
    check('a fully paid payment respects an explicit paid date', p6.paidDate, RECENT);
    check('a fully paid past-due payment is still paid', p6.status, 'paid');

    // --- the live status rule: a stale stored status reads as the truth ---
    // Inserted directly through the repository (bypassing the service's
    // derivation) with a stale "pending" stored value and a past due date.
    const paymentRepo = AppDataSource.getRepository(RentPayment);
    await paymentRepo.save(
      paymentRepo.create({
        tenant: { id: rahul.id } as Tenant,
        amount: 4000,
        paidAmount: 0,
        dueDate: YESTERDAY,
        paidDate: null,
        status: PaymentStatus.Pending,
        notes: null
      })
    );
    const rahulPageAfterStale = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { tenantId: rahul.id }, asAdmin),
      'getAllRentPayments'
    );
    const staleRow = rahulPageAfterStale.items.find((item) => item.amount === 4000);
    if (!staleRow) throw new Error('FAIL the stale inserted payment was not listed');
    check('a stale stored pending reads as live overdue', staleRow.status, 'overdue');

    // --- getAllRentPayments: pagination, search, filters (FR-21) ---
    // Created so far: p1 (rahul pending), p2 (rahul partial), p3 (priya paid),
    // p4 (priya overdue), p5 (cross pending), p6 (rahul paid), stale (rahul
    // live-overdue). Alpha = 6 payments, beta = 1, global = 7.
    const globalPage = field<PaymentPageShape>(await exec(GET_PAYMENTS, {}, asAdmin), 'getAllRentPayments');
    check('the payment list reports the global total', globalPage.total, 7);
    check('the payment list defaults to limit 20', globalPage.limit, 20);

    const alphaPage = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { pgId: alpha.id }, asAdmin),
      'getAllRentPayments'
    );
    check('the pgId filter scopes to one PG', alphaPage.total, 6);

    const rahulPage = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { tenantId: rahul.id }, asAdmin),
      'getAllRentPayments'
    );
    check('the tenantId filter scopes to one tenant', rahulPage.total, 4);
    check(
      'the tenant filter returns only that tenant',
      rahulPage.items.every((item) => item.tenant?.id === rahul.id),
      true
    );

    const dueDates = globalPage.items.map((item) => item.dueDate);
    check(
      'the payment list is ordered by newest due date',
      dueDates.every((dueDate, i) => i === 0 || dueDate <= dueDates[i - 1]),
      true
    );

    const paidFilter = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { status: 'paid' }, asAdmin),
      'getAllRentPayments'
    );
    check('the paid filter counts the fully paid payments', paidFilter.total, 2);
    const overdueFilter = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { status: 'overdue' }, asAdmin),
      'getAllRentPayments'
    );
    check('the overdue filter matches the live status (stale row included)', overdueFilter.total, 2);
    const pendingFilter = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { status: 'pending' }, asAdmin),
      'getAllRentPayments'
    );
    check('the pending filter excludes the stale overdue row', pendingFilter.total, 2);
    const partialFilter = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { status: 'partial' }, asAdmin),
      'getAllRentPayments'
    );
    check('the partial filter counts partial payments', partialFilter.total, 1);

    const byName = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { search: 'rahul verma' }, asAdmin),
      'getAllRentPayments'
    );
    check('search matches the tenant name case-insensitively', byName.total, 4);
    const byEmail = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { search: 'phase6.rahul' }, asAdmin),
      'getAllRentPayments'
    );
    check('search matches the linked user email', byEmail.total, 4);
    const byRoom = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { search: 'a-101' }, asAdmin),
      'getAllRentPayments'
    );
    check('search matches the tenant room number', byRoom.total, 4);
    const byNotes = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { search: 'backdated full payment' }, asAdmin),
      'getAllRentPayments'
    );
    check('search matches the payment notes', byNotes.total, 1);
    const searchMiss = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { search: 'no-such-payment' }, asAdmin),
      'getAllRentPayments'
    );
    check('search can return an empty page', searchMiss.items.length, 0);

    const limited = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { limit: 3, offset: 0 }, asAdmin),
      'getAllRentPayments'
    );
    check('the payment list paginates items', limited.items.length, 3);
    check('the payment list reports the total across pages', limited.total, 7);
    check('the payment list echoes limit/offset', `${limited.limit}/${limited.offset}`, '3/0');
    const tail = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { limit: 3, offset: 6 }, asAdmin),
      'getAllRentPayments'
    );
    check('the payment list returns the final partial page', tail.items.length, 1);

    expectError(
      'the payment list rejects limit 0',
      await exec(GET_PAYMENTS, { limit: 0 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the payment list rejects limit above the max',
      await exec(GET_PAYMENTS, { limit: 101 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the payment list rejects a negative offset',
      await exec(GET_PAYMENTS, { offset: -1 }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the payment list rejects an unknown pgId filter',
      await exec(GET_PAYMENTS, { pgId: NONEXISTENT_ID }, asAdmin),
      'BAD_USER_INPUT'
    );
    expectError(
      'the payment list rejects an unknown tenantId filter',
      await exec(GET_PAYMENTS, { tenantId: NONEXISTENT_ID }, asAdmin),
      'BAD_USER_INPUT'
    );

    // --- nested resolution through the relation field resolvers ---
    const deep = field<{ items: DeepPaymentShape[] }>(
      await exec(GET_PAYMENTS_DEEP, { search: 'backdated' }, asAdmin),
      'getAllRentPayments'
    );
    const deepPayment = deep.items[0];
    if (!deepPayment) throw new Error('Deep payment query returned no items');
    check('the payment resolves its tenant', deepPayment.tenant.name, 'Rahul Verma');
    check('the tenant resolves its user', deepPayment.tenant.user.email, TENANT_EMAILS[0]);
    check('the tenant resolves its PG', deepPayment.tenant.pg.name, TEST_PG_NAMES[0]);
    check('the tenant resolves its room', deepPayment.tenant.room?.roomNumber, 'A-101');

    const tenantPayments = field<{ items: { payments: PaymentShape[] }[] }>(
      await exec(GET_TENANTS_PAYMENTS, { search: 'Priya Sharma' }, asAdmin),
      'getAllTenants'
    );
    const priyaPayments = tenantPayments.items[0]?.payments;
    if (!priyaPayments) throw new Error('Tenant.payments did not resolve for Priya');
    check('Tenant.payments resolves the tenant own payments', priyaPayments.length, 2);

    // --- getAdminRentSummary (FR-21) ---
    // Global: 7 payments, billed 49000, collected 18000 (3000 + 6000 + 9000),
    // outstanding 31000; pending 2 (p1, p5), partial 1 (p2), paid 2 (p3, p6),
    // overdue 2 (p4, stale-live).
    const globalSummary = field<SummaryShape>(await exec(GET_SUMMARY, {}, asAdmin), 'getAdminRentSummary');
    check('the summary counts all payments', globalSummary.totalPayments, 7);
    check('the summary sums the billed amounts', globalSummary.totalBilled, 49000);
    check('the summary sums the collected amounts', globalSummary.totalCollected, 18000);
    check('the summary computes the outstanding amount', globalSummary.outstandingAmount, 31000);
    check('the summary counts pending payments', globalSummary.pendingCount, 2);
    check('the summary counts partial payments', globalSummary.partialCount, 1);
    check('the summary counts paid payments', globalSummary.paidCount, 2);
    check('the summary counts overdue payments (live)', globalSummary.overdueCount, 2);

    const alphaSummary = field<SummaryShape>(
      await exec(GET_SUMMARY, { pgId: alpha.id }, asAdmin),
      'getAdminRentSummary'
    );
    check('the PG-scoped summary counts payments', alphaSummary.totalPayments, 6);
    check('the PG-scoped summary sums billed', alphaSummary.totalBilled, 42000);
    check('the PG-scoped summary counts paid', alphaSummary.paidCount, 2);

    const betaSummary = field<SummaryShape>(
      await exec(GET_SUMMARY, { pgId: beta.id }, asAdmin),
      'getAdminRentSummary'
    );
    check('the beta summary counts payments', betaSummary.totalPayments, 1);
    check('the beta summary sums collected', betaSummary.totalCollected, 0);
    check('the beta summary counts pending', betaSummary.pendingCount, 1);

    expectError(
      'the summary rejects an unknown pgId',
      await exec(GET_SUMMARY, { pgId: NONEXISTENT_ID }, asAdmin),
      'BAD_USER_INPUT'
    );

    // --- getRentPaymentHistory: tenant-scoped (FR-20, FR-23) ---
    const rahulHistory = field<PaymentPageShape>(
      await exec(GET_TENANT_HISTORY, {}, asTenant(rahulUser)),
      'getRentPaymentHistory'
    );
    check("the tenant history shows the tenant's payments", rahulHistory.total, 4);
    check(
      'the tenant history never leaks other tenants',
      rahulHistory.items.every((item) => item.tenant?.id === rahul.id),
      true
    );
    const historyDueDates = rahulHistory.items.map((item) => item.dueDate);
    check(
      'the tenant history is ordered by newest due date',
      historyDueDates.every((dueDate, i) => i === 0 || dueDate <= historyDueDates[i - 1]),
      true
    );
    const rahulHistoryPage = field<PaymentPageShape>(
      await exec(GET_TENANT_HISTORY, { limit: 2, offset: 0 }, asTenant(rahulUser)),
      'getRentPaymentHistory'
    );
    check('the tenant history paginates', rahulHistoryPage.items.length, 2);

    const priyaHistory = field<PaymentPageShape>(
      await exec(GET_TENANT_HISTORY, {}, asTenant(priyaUser)),
      'getRentPaymentHistory'
    );
    check('another tenant sees only their own payments', priyaHistory.total, 2);
    const crossHistory = field<PaymentPageShape>(
      await exec(GET_TENANT_HISTORY, {}, asTenant(crossUser)),
      'getRentPaymentHistory'
    );
    check('the beta tenant sees only their own payments', crossHistory.total, 1);
    const roomlessHistory = field<PaymentPageShape>(
      await exec(GET_TENANT_HISTORY, {}, asTenant(roomlessUser)),
      'getRentPaymentHistory'
    );
    check('a user without a tenant record gets an empty page', roomlessHistory.total, 0);
    check('the empty history page has no items', roomlessHistory.items.length, 0);

    // --- updateRentPayment (FR-19) ---
    expectError(
      'updateRentPayment rejects an unknown id',
      await exec(UPDATE_PAYMENT, { id: NONEXISTENT_ID, input: { paidAmount: 100 } }, asAdmin),
      'NOT_FOUND'
    );

    const markedPaid = field<PaymentShape>(
      await exec(UPDATE_PAYMENT, { id: p1.id, input: { paidAmount: 10000 } }, asAdmin),
      'updateRentPayment'
    );
    check('marking fully paid sets the paid status', markedPaid.status, 'paid');
    check('marking fully paid derives the paid date', markedPaid.paidDate, TODAY);

    const lowered = field<PaymentShape>(
      await exec(UPDATE_PAYMENT, { id: p1.id, input: { paidAmount: 4000 } }, asAdmin),
      'updateRentPayment'
    );
    check('lowering the paid amount returns the payment to partial', lowered.status, 'partial');
    check('lowering the paid amount clears the paid date', lowered.paidDate, null);

    expectError(
      'updateRentPayment rejects an amount below the paid amount',
      await exec(UPDATE_PAYMENT, { id: p1.id, input: { amount: 3000 } }, asAdmin),
      'BAD_USER_INPUT'
    );
    const raised = field<PaymentShape>(
      await exec(UPDATE_PAYMENT, { id: p1.id, input: { amount: 5000 } }, asAdmin),
      'updateRentPayment'
    );
    check('raising the amount keeps the partial status', raised.status, 'partial');
    check('raising the amount stores the new amount', raised.amount, 5000);

    const overdueFlip = field<PaymentShape>(
      await exec(UPDATE_PAYMENT, { id: p2.id, input: { dueDate: YESTERDAY } }, asAdmin),
      'updateRentPayment'
    );
    check('a partial payment past its due date becomes overdue', overdueFlip.status, 'overdue');

    const settled = field<PaymentShape>(
      await exec(UPDATE_PAYMENT, { id: p2.id, input: { paidAmount: 8000 } }, asAdmin),
      'updateRentPayment'
    );
    check('settling an overdue payment makes it paid', settled.status, 'paid');
    check('settling derives a paid date', settled.paidDate, TODAY);

    const notesCleared = field<PaymentShape>(
      await exec(UPDATE_PAYMENT, { id: p3.id, input: { notes: '' } }, asAdmin),
      'updateRentPayment'
    );
    check('an empty notes string clears the notes', notesCleared.notes, null);
    const notesSet = field<PaymentShape>(
      await exec(UPDATE_PAYMENT, { id: p3.id, input: { notes: '  Phone payment  ' } }, asAdmin),
      'updateRentPayment'
    );
    check('the notes update trims the value', notesSet.notes, 'Phone payment');

    const pendingAgain = field<PaymentShape>(
      await exec(UPDATE_PAYMENT, { id: p4.id, input: { dueDate: FUTURE } }, asAdmin),
      'updateRentPayment'
    );
    check('pushing the due date back returns the payment to pending', pendingAgain.status, 'pending');

    const noop = field<PaymentShape>(
      await exec(UPDATE_PAYMENT, { id: p6.id, input: {} }, asAdmin),
      'updateRentPayment'
    );
    check('an empty update keeps the paid status', noop.status, 'paid');
    check('an empty update keeps the paid date', noop.paidDate, RECENT);
    check('an empty update keeps the notes', noop.notes, 'Phase6 backdated full payment');

    expectError(
      'updateRentPayment rejects a future paid date',
      await exec(
        UPDATE_PAYMENT,
        { id: p2.id, input: { paidDate: isoDate(1) } },
        asAdmin
      ),
      'BAD_USER_INPUT'
    );
    expectError(
      'updateRentPayment rejects a paid date on a partial payment',
      await exec(UPDATE_PAYMENT, { id: p1.id, input: { paidDate: YESTERDAY } }, asAdmin),
      'BAD_USER_INPUT'
    );

    // --- concurrent updates of one payment serialize (row lock) ---
    // Two disjoint-field updates racing: both must land, with no lost update.
    const [racedPaid, racedNotes] = await Promise.all([
      exec(UPDATE_PAYMENT, { id: p5.id, input: { paidAmount: 7000 } }, asAdmin),
      exec(UPDATE_PAYMENT, { id: p5.id, input: { notes: 'raced note' } }, asAdmin)
    ]);
    if (!racedPaid.data?.updateRentPayment || !racedNotes.data?.updateRentPayment) {
      throw new Error(
        `FAIL concurrent updates: one lost (${racedPaid.errors?.[0]?.message ?? 'ok'} / ${racedNotes.errors?.[0]?.message ?? 'ok'})`
      );
    }
    console.log('PASS: concurrent updates of one payment both land');
    const settledRace = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { tenantId: cross.id }, asAdmin),
      'getAllRentPayments'
    );
    const racedPayment = settledRace.items[0];
    if (!racedPayment) throw new Error('The raced payment was not found');
    check('the raced payment kept the paid amount', racedPayment.paidAmount, 7000);
    check('the raced payment kept the note', racedPayment.notes, 'raced note');
    check('the raced payment is fully paid', racedPayment.status, 'paid');

    const explicitPaidDate = field<PaymentShape>(
      await exec(
        UPDATE_PAYMENT,
        { id: p1.id, input: { paidAmount: 5000, paidDate: isoDate(-3) } },
        asAdmin
      ),
      'updateRentPayment'
    );
    check('an update respects an explicit paid date', explicitPaidDate.paidDate, isoDate(-3));
    check('the fully paid update stores the paid status', explicitPaidDate.status, 'paid');

    // --- post-update summary re-check (list and summary stay consistent) ---
    // Final alpha state: p1 5000/5000 paid, p2 8000/8000 paid, p3 6000/6000
    // paid, p4 5000/0 pending, p6 9000/9000 paid, stale 4000/0 overdue.
    // Beta: p5 7000/7000 paid.
    const finalGlobal = field<SummaryShape>(await exec(GET_SUMMARY, {}, asAdmin), 'getAdminRentSummary');
    check('the final summary counts all payments', finalGlobal.totalPayments, 7);
    check('the final summary sums billed', finalGlobal.totalBilled, 44000);
    check('the final summary sums collected', finalGlobal.totalCollected, 35000);
    check('the final summary computes outstanding', finalGlobal.outstandingAmount, 9000);
    check('the final summary counts pending', finalGlobal.pendingCount, 1);
    check('the final summary counts partial', finalGlobal.partialCount, 0);
    check('the final summary counts paid', finalGlobal.paidCount, 5);
    check('the final summary counts overdue', finalGlobal.overdueCount, 1);

    const finalPaidFilter = field<PaymentPageShape>(
      await exec(GET_PAYMENTS, { status: 'paid' }, asAdmin),
      'getAllRentPayments'
    );
    check('the final paid filter agrees with the summary', finalPaidFilter.total, 5);
    const finalAlpha = field<SummaryShape>(
      await exec(GET_SUMMARY, { pgId: alpha.id }, asAdmin),
      'getAdminRentSummary'
    );
    check('the final alpha summary counts payments', finalAlpha.totalPayments, 6);
    check('the final alpha summary sums outstanding', finalAlpha.outstandingAmount, 9000);

    // --- getAdminRentHistory: recent activity (FR-21) ---
    const historyFeed = field<PaymentPageShape>(
      await exec(GET_ADMIN_HISTORY, { limit: 3 }, asAdmin),
      'getAdminRentHistory'
    );
    check('the admin history reports the total', historyFeed.total, 7);
    check('the admin history respects the limit', historyFeed.items.length, 3);
    check(
      'the admin history leads with the most recently updated payment',
      historyFeed.items[0]?.id,
      p1.id
    );
    check(
      'the admin history follows with the raced payment',
      historyFeed.items[1]?.id,
      p5.id
    );
    check(
      'the admin history resolves the tenant and PG',
      `${historyFeed.items[0]?.tenant?.name}/${historyFeed.items[0]?.tenant?.pg?.name ?? 'no pg'}`,
      'Rahul Verma/Phase6 Verify PG Alpha'
    );
    expectError(
      'the admin history rejects the Tenant role',
      await exec(GET_ADMIN_HISTORY, {}, asTenant(rahulUser)),
      'FORBIDDEN'
    );

    // --- tenant history reflects the updates ---
    const rahulHistoryFinal = field<PaymentPageShape>(
      await exec(GET_TENANT_HISTORY, {}, asTenant(rahulUser)),
      'getRentPaymentHistory'
    );
    check('the tenant history reflects the updates', rahulHistoryFinal.total, 4);

    // --- write-invariant integrity sweep ---
    const testPayments = await paymentRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.tenant', 'tenant')
      .leftJoin('tenant.user', 'user')
      .where('user.email IN (:...emails)', { emails: TENANT_EMAILS })
      .getMany();
    if (testPayments.length !== 7) {
      throw new Error(`Expected 7 test payments for the sweep, found ${testPayments.length}`);
    }
    for (const payment of testPayments) {
      if (payment.paidAmount > payment.amount) {
        throw new Error(`FAIL integrity: payment ${payment.id} has paidAmount > amount`);
      }
      const fullyPaid = payment.paidAmount >= payment.amount;
      if (fullyPaid !== (payment.paidDate !== null)) {
        throw new Error(
          `FAIL integrity: payment ${payment.id} paid state and paidDate disagree`
        );
      }
    }
    console.log('PASS: every payment satisfies paidAmount <= amount and the paidDate rule');

    console.log('\nAll Phase 6 rent and payment management checks passed.');
  } finally {
    await cleanupTestData();
    await server.stop();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Phase 6 verification FAILED:', error);
  process.exit(1);
});
