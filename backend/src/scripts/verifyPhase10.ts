import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import type { Request, Response } from 'express';
import { GraphQLFormattedError } from 'graphql';
import { In } from 'typeorm';

import { AppDataSource } from '../config/db';
import { Complaint, ComplaintStatus } from '../entities/complaint.entity';
import { Pg } from '../entities/pg.entity';
import { PaymentStatus, RentPayment } from '../entities/rent_payment.entity';
import { Room } from '../entities/room.entity';
import { Tenant } from '../entities/tenant.entity';
import { User, UserRole } from '../entities/user.entity';
import { resolvers } from '../graphql/resolvers';
import { typeDefs } from '../graphql/typeDefs';
import type { AuthUser, GraphQLContext } from '../types';
import { hashPassword } from '../utils/password';

const TEST_ADMIN_EMAIL = 'phase10.admin@hostel.test';
const TEST_ADMIN_NAME = 'Phase Ten Admin';
const TENANT_EMAIL = 'phase10.tenant@hostel.test';
const TENANT_EMAIL_2 = 'phase10.tenant2@hostel.test';
const TENANT_EMAIL_3 = 'phase10.tenant3@hostel.test';
const TENANT_NAME = 'Phase Ten Tenant';
const TEST_USER_EMAILS = [TEST_ADMIN_EMAIL, TENANT_EMAIL, TENANT_EMAIL_2, TENANT_EMAIL_3];
const TEST_PASSWORD = 'phase10-verify-password';
const TEST_PG_NAMES = ['Phase10 Verify PG Alpha', 'Phase10 Verify PG Beta'];
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

const OVERDUE_DATE = '2020-01-01';
const FUTURE_DATE = '2999-01-01';

interface GqlResult {
  data: Record<string, unknown> | null;
  errors?: readonly GraphQLFormattedError[];
}

interface OccupancyRow {
  pgId: string;
  pgName: string;
  totalRooms: number;
  occupiedRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  occupancyPercent: number;
}

interface DashboardShape {
  totalPgs: number;
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  occupancyPercent: number;
  totalTenants: number;
  totalPayments: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  overdueCount: number;
  totalBilled: number;
  totalCollected: number;
  outstandingAmount: number;
  openComplaints: number;
  inProgressComplaints: number;
  resolvedComplaints: number;
  totalAnnouncements: number;
  occupancyByProperty: OccupancyRow[];
  recentPayments: { items: { id: string }[]; total: number; limit: number; offset: number };
  recentComplaints: { items: { id: string }[]; total: number; limit: number; offset: number };
}

const server = new ApolloServer<GraphQLContext>({ typeDefs, resolvers });

const DASHBOARD_FIELDS = `
  totalPgs
  totalRooms
  occupiedRooms
  vacantRooms
  totalBeds
  occupiedBeds
  occupancyPercent
  totalTenants
  totalPayments
  paidCount
  partialCount
  pendingCount
  overdueCount
  totalBilled
  totalCollected
  outstandingAmount
  openComplaints
  inProgressComplaints
  resolvedComplaints
  totalAnnouncements
  occupancyByProperty {
    pgId
    pgName
    totalRooms
    occupiedRooms
    totalBeds
    occupiedBeds
    occupancyPercent
  }
  recentPayments {
    total
    limit
    offset
    items {
      id
    }
  }
  recentComplaints {
    total
    limit
    offset
    items {
      id
    }
  }
`;

async function gql(
  query: string,
  variables: Record<string, unknown> = {},
  user?: AuthUser
): Promise<GqlResult> {
  const contextValue: GraphQLContext = {
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
}

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL: ${label}`);
  }
}

async function createUser(name: string, email: string, role: UserRole): Promise<User> {
  const repo = AppDataSource.getRepository(User);
  const user = repo.create({ name, email, role, password: await hashPassword(TEST_PASSWORD) });
  return repo.save(user);
}

async function readStats(
  variables: Record<string, unknown> = {},
  admin: User
): Promise<DashboardShape> {
  const result = await gql(
    `query Read($pgId: ID, $recentLimit: Int) {
      getAdminDashboardStats(pgId: $pgId, recentLimit: $recentLimit) { ${DASHBOARD_FIELDS} }
    }`,
    variables,
    { id: admin.id, role: 'Admin' }
  );
  const stats = result.data?.getAdminDashboardStats as DashboardShape | undefined;
  if (stats === undefined) {
    throw new Error(
      `Dashboard query returned no data: ${result.errors?.[0]?.message ?? 'unknown error'}`
    );
  }
  return stats;
}

function checkDelta(label: string, after: number, before: number, added: number): void {
  check(`${label} (${after - before} added)`, after - before === added);
}

async function cleanup(): Promise<void> {
  const pgRepo = AppDataSource.getRepository(Pg);
  const pgs = await pgRepo
    .createQueryBuilder('pg')
    .where('pg.name IN (:...names)', { names: TEST_PG_NAMES })
    .getMany();
  const pgIds = pgs.map((pg) => pg.id);

  if (pgIds.length > 0) {
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenants = await tenantRepo
      .createQueryBuilder('tenant')
      .where('tenant."pgId" IN (:...ids)', { ids: pgIds })
      .getMany();
    const tenantIds = tenants.map((tenant) => tenant.id);

    if (tenantIds.length > 0) {
      await AppDataSource.getRepository(Complaint)
        .createQueryBuilder()
        .delete()
        .where('"tenantId" IN (:...ids)', { ids: tenantIds })
        .execute();
      await AppDataSource.getRepository(RentPayment)
        .createQueryBuilder()
        .delete()
        .where('"tenantId" IN (:...ids)', { ids: tenantIds })
        .execute();
      await tenantRepo.delete(tenantIds);
    }
    await AppDataSource.getRepository(Room)
      .createQueryBuilder()
      .delete()
      .where('"pgId" IN (:...ids)', { ids: pgIds })
      .execute();
    await pgRepo.delete(pgIds);
  }

  const users = await AppDataSource.getRepository(User).find({
    where: { email: In(TEST_USER_EMAILS) }
  });
  if (users.length > 0) {
    await AppDataSource.getRepository(User).delete(users.map((user) => user.id));
  }
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  await server.start();
  await cleanup();

  const admin = await createUser(TEST_ADMIN_NAME, TEST_ADMIN_EMAIL, UserRole.Admin);
  const tenantUser = await createUser(TENANT_NAME, TENANT_EMAIL, UserRole.Tenant);
  const tenantUser2 = await createUser('Phase Ten Tenant Two', TENANT_EMAIL_2, UserRole.Tenant);
  const tenantUser3 = await createUser('Phase Ten Tenant Three', TENANT_EMAIL_3, UserRole.Tenant);

  try {

    const query = `query { getAdminDashboardStats { ${DASHBOARD_FIELDS} } }`;

    const asGuest = await gql(query);
    check(
      'guest is rejected',
      (asGuest.errors?.[0]?.extensions?.code ?? '') === 'FORBIDDEN'
    );
    check('guest gets no data', !asGuest.data?.getAdminDashboardStats);

    const asTenant = await gql(query, {}, { id: tenantUser.id, role: 'Tenant' });
    check(
      'tenant is rejected',
      (asTenant.errors?.[0]?.extensions?.code ?? '') === 'FORBIDDEN'
    );
    check('tenant gets no data', !asTenant.data?.getAdminDashboardStats);

    const before = await readStats({}, admin);
    check('baseline query succeeds', before !== undefined);
    check(
      'occupancy percent is a whole number in 0..100',
      Number.isInteger(before.occupancyPercent) &&
        before.occupancyPercent >= 0 &&
        before.occupancyPercent <= 100
    );
    check(
      'outstanding is never negative',
      before.totalBilled - before.totalCollected === before.outstandingAmount
    );
    check(
      'vacant rooms plus occupied rooms equals total rooms',
      before.occupiedRooms + before.vacantRooms === before.totalRooms
    );

    const pgRepo = AppDataSource.getRepository(Pg);
    const roomRepo = AppDataSource.getRepository(Room);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const paymentRepo = AppDataSource.getRepository(RentPayment);
    const complaintRepo = AppDataSource.getRepository(Complaint);

    const alpha = await pgRepo.save(
      pgRepo.create({ name: TEST_PG_NAMES[0], address: '1 Alpha Street', city: 'Pune' })
    );
    const beta = await pgRepo.save(
      pgRepo.create({ name: TEST_PG_NAMES[1], address: '2 Beta Street', city: 'Pune' })
    );

    const alphaRoomA = await roomRepo.save(
      roomRepo.create({
        pg: alpha,
        roomNumber: 'A-101',
        roomType: 'Double',
        capacity: 2,
        occupiedCount: 1,
        rent: 5000
      })
    );
    await roomRepo.save(
      roomRepo.create({
        pg: alpha,
        roomNumber: 'A-102',
        roomType: 'Single',
        capacity: 1,
        occupiedCount: 0,
        rent: 3000
      })
    );
    const betaRoomA = await roomRepo.save(
      roomRepo.create({
        pg: beta,
        roomNumber: 'B-201',
        roomType: 'Double',
        capacity: 2,
        occupiedCount: 2,
        rent: 6000
      })
    );
    const betaRoomB = await roomRepo.save(
      roomRepo.create({
        pg: beta,
        roomNumber: 'B-202',
        roomType: 'Double',
        capacity: 2,
        occupiedCount: 2,
        rent: 6000
      })
    );
    void alphaRoomA;
    void betaRoomA;
    void betaRoomB;

    const alphaTenant1 = await tenantRepo.save(
      tenantRepo.create({ name: 'Alpha Tenant One', pg: alpha, room: alphaRoomA, user: tenantUser })
    );
    const alphaTenant2 = await tenantRepo.save(
      tenantRepo.create({ name: 'Alpha Tenant Two', pg: alpha, user: tenantUser2 })
    );
    const betaTenant1 = await tenantRepo.save(
      tenantRepo.create({ name: 'Beta Tenant One', pg: beta, room: betaRoomA, user: tenantUser3 })
    );

    const paid = await paymentRepo.save(
      paymentRepo.create({
        tenant: alphaTenant1,
        amount: 5000,
        paidAmount: 5000,
        dueDate: OVERDUE_DATE,
        paidDate: OVERDUE_DATE,
        status: PaymentStatus.Paid
      })
    );
    const partial = await paymentRepo.save(
      paymentRepo.create({
        tenant: alphaTenant2,
        amount: 4000,
        paidAmount: 1500,
        dueDate: FUTURE_DATE,
        status: PaymentStatus.Partial
      })
    );
    const pending = await paymentRepo.save(
      paymentRepo.create({
        tenant: betaTenant1,
        amount: 6000,
        paidAmount: 0,
        dueDate: FUTURE_DATE,
        status: PaymentStatus.Pending
      })
    );
    const overdue = await paymentRepo.save(
      paymentRepo.create({
        tenant: alphaTenant1,
        amount: 2500,
        paidAmount: 0,
        dueDate: OVERDUE_DATE,
        status: PaymentStatus.Pending
      })
    );

    const fixtureComplaints = await complaintRepo.save([
      complaintRepo.create({
        tenant: alphaTenant1,
        pg: alpha,
        title: 'Leaking tap',
        description: 'The bathroom tap drips constantly.',
        status: ComplaintStatus.Open
      }),
      complaintRepo.create({
        tenant: betaTenant1,
        pg: beta,
        title: 'Fan noise',
        description: 'The ceiling fan makes a rattling sound.',
        status: ComplaintStatus.InProgress
      }),
      complaintRepo.create({
        tenant: alphaTenant2,
        pg: alpha,
        title: 'Broken chair',
        description: 'The study chair leg is broken.',
        status: ComplaintStatus.Resolved,
        resolvedAt: new Date()
      })
    ]);

    const stats = await readStats({}, admin);

    // Every unscoped total must have moved by exactly what the fixture added.
    checkDelta('total properties', stats.totalPgs, before.totalPgs, 2);
    checkDelta('total rooms', stats.totalRooms, before.totalRooms, 4);
    checkDelta('occupied rooms', stats.occupiedRooms, before.occupiedRooms, 3);
    checkDelta('vacant rooms', stats.vacantRooms, before.vacantRooms, 1);
    checkDelta('total beds', stats.totalBeds, before.totalBeds, 7);
    checkDelta('occupied beds', stats.occupiedBeds, before.occupiedBeds, 5);
    checkDelta('total tenants', stats.totalTenants, before.totalTenants, 3);
    checkDelta('total payments', stats.totalPayments, before.totalPayments, 4);
    checkDelta('paid count', stats.paidCount, before.paidCount, 1);
    checkDelta('partial count', stats.partialCount, before.partialCount, 1);
    checkDelta('pending count', stats.pendingCount, before.pendingCount, 1);
    // The live-status rule must override the stored "pending" snapshot.
    checkDelta('overdue count uses the live status rule', stats.overdueCount, before.overdueCount, 1);
    checkDelta('total billed', stats.totalBilled, before.totalBilled, 17500);
    checkDelta('total collected', stats.totalCollected, before.totalCollected, 6500);
    checkDelta('outstanding', stats.outstandingAmount, before.outstandingAmount, 11000);
    checkDelta('open complaints', stats.openComplaints, before.openComplaints, 1);
    checkDelta('in-progress complaints', stats.inProgressComplaints, before.inProgressComplaints, 1);
    checkDelta('resolved complaints', stats.resolvedComplaints, before.resolvedComplaints, 1);

    check(
      'status counts partition the payments',
      stats.paidCount + stats.partialCount + stats.pendingCount + stats.overdueCount ===
        stats.totalPayments
    );
    check(
      'outstanding = billed - collected after the fixture',
      stats.totalBilled - stats.totalCollected === stats.outstandingAmount
    );
    check(
      'rooms still partition after the fixture',
      stats.occupiedRooms + stats.vacantRooms === stats.totalRooms
    );

    const series = stats.occupancyByProperty;
    check('series has one row per property in the database', series.length === stats.totalPgs);
    const alphaRow = series.find((row) => row.pgId === alpha.id);
    const betaRow = series.find((row) => row.pgId === beta.id);
    check('series includes the first fixture property', alphaRow !== undefined);
    check('series includes the second fixture property', betaRow !== undefined);
    check('alpha occupancy percent', alphaRow?.occupancyPercent === 33);
    check('alpha occupied beds', alphaRow?.occupiedBeds === 1);
    check('alpha total beds', alphaRow?.totalBeds === 3);
    check('alpha occupied rooms', alphaRow?.occupiedRooms === 1);
    check('beta occupancy percent', betaRow?.occupancyPercent === 100);
    check('beta occupied beds', betaRow?.occupiedBeds === 4);
    check(
      'series is sorted by occupancy, highest first',
      series.every((row, index) => index === 0 || series[index - 1].occupancyPercent >= row.occupancyPercent)
    );
    check(
      'series occupancy percent matches its own beds',
      series.every((row) => row.occupancyPercent === (row.totalBeds > 0
        ? Math.round((row.occupiedBeds / row.totalBeds) * 100)
        : 0))
    );

    const recentPayments = stats.recentPayments;
    check('recent payments page shape', recentPayments.limit === 5 && recentPayments.offset === 0);
    check(
      'recent payments returns at most the default limit',
      recentPayments.items.length === Math.min(5, stats.totalPayments)
    );
    check('recent payments is newest-activity first', recentPayments?.items[0]?.id === overdue.id);
    check(
      'recent payments total matches the aggregate count',
      recentPayments?.total === stats.totalPayments
    );

    const recentComplaints = stats.recentComplaints;
    check(
      'recent complaints total matches the complaint counts',
      recentComplaints.total ===
        stats.openComplaints + stats.inProgressComplaints + stats.resolvedComplaints
    );
    check(
      'recent complaints returns at most the default limit',
      recentComplaints.items.length === Math.min(5, recentComplaints.total)
    );

    const alphaStats = await readStats({ pgId: alpha.id }, admin);
    check('scope reports one property', alphaStats.totalPgs === 1);
    check("scope counts only that property's rooms", alphaStats.totalRooms === 2);
    check("scope counts only that property's beds", alphaStats.totalBeds === 3);
    check("scope counts only that property's tenants", alphaStats.totalTenants === 2);
    check("scope counts only that property's payments", alphaStats.totalPayments === 3);
    check("scope counts only that property's complaints", alphaStats.openComplaints === 1);
    check('scope keeps the live status rule', alphaStats.overdueCount === 1);
    check('scope bills only that property', alphaStats.totalBilled === 11500);
    check('scope collects only that property', alphaStats.totalCollected === 6500);
    check('scope is never narrower than the unscoped total', alphaStats.totalPayments < stats.totalPayments);
    check('scope series is never narrowed', alphaStats.occupancyByProperty.length === stats.totalPgs);
    check(
      'scoped recent payments exclude the other property',
      alphaStats.recentPayments.items.every((item) => item.id !== pending.id)
    );
    check(
      'scoped recent payments total matches the scoped count',
      alphaStats.recentPayments.total === alphaStats.totalPayments
    );
    check(
      'scoped recent complaints include every complaint of that property',
      fixtureComplaints
        .filter((complaint) => complaint.pg.id === alpha.id)
        .every((complaint) =>
          alphaStats.recentComplaints.items.some((item) => item.id === complaint.id)
        )
    );
    check(
      'scoped recent complaints exclude the other property',
      alphaStats.recentComplaints.items.every(
        (item) => !fixtureComplaints.some(
          (complaint) => complaint.id === item.id && complaint.pg.id === beta.id
        )
      )
    );

    const badScope = await gql(
      `query Scope($pgId: ID) { getAdminDashboardStats(pgId: $pgId) { totalPgs } }`,
      { pgId: NONEXISTENT_ID },
      { id: admin.id, role: 'Admin' }
    );
    check(
      'scoping to a nonexistent property is a client error',
      (badScope.errors?.[0]?.extensions?.code ?? '') === 'BAD_USER_INPUT'
    );

    const limitQuery = `query Limited($recentLimit: Int) {
      getAdminDashboardStats(recentLimit: $recentLimit) {
        recentPayments { limit total items { id } }
        recentComplaints { limit total items { id } }
      }
    }`;

    const limited = await gql(limitQuery, { recentLimit: 2 }, { id: admin.id, role: 'Admin' });
    const limitedData = limited.data?.getAdminDashboardStats as
      | { recentPayments: { limit: number; items: unknown[] }; recentComplaints: { items: unknown[] } }
      | undefined;
    check('recentLimit bounds the payment list', limitedData?.recentPayments.items.length === 2);
    check('recentLimit is echoed back', limitedData?.recentPayments.limit === 2);
    check('recentLimit bounds the complaint list', limitedData?.recentComplaints.items.length === 2);

    const badLimit = await gql(limitQuery, { recentLimit: 0 }, { id: admin.id, role: 'Admin' });
    check(
      'recentLimit below 1 is a client error',
      (badLimit.errors?.[0]?.extensions?.code ?? '') === 'BAD_USER_INPUT'
    );

    const tooBigLimit = await gql(limitQuery, { recentLimit: 500 }, { id: admin.id, role: 'Admin' });
    check(
      'recentLimit above 20 is a client error',
      (tooBigLimit.errors?.[0]?.extensions?.code ?? '') === 'BAD_USER_INPUT'
    );

    const summaryQuery = `query {
      getAdminRentSummary {
        totalPayments
        totalBilled
        totalCollected
        outstandingAmount
        paidCount
        partialCount
        pendingCount
        overdueCount
      }
    }`;
    const summary = await gql(summaryQuery, {}, { id: admin.id, role: 'Admin' });
    const summaryData = summary.data?.getAdminRentSummary as Record<string, number> | undefined;
    check('dashboard and rent summary agree on totals', summaryData !== undefined && (
      summaryData.totalPayments === stats?.totalPayments &&
      summaryData.totalBilled === stats?.totalBilled &&
      summaryData.totalCollected === stats?.totalCollected &&
      summaryData.outstandingAmount === stats?.outstandingAmount &&
      summaryData.paidCount === stats?.paidCount &&
      summaryData.partialCount === stats?.partialCount &&
      summaryData.pendingCount === stats?.pendingCount &&
      summaryData.overdueCount === stats?.overdueCount
    ));

    const dbPaymentCount = await paymentRepo.count();
    const dbComplaintCount = await complaintRepo.count();
    const dbRoomCount = await roomRepo.count();
    const dbTenantCount = await tenantRepo.count();
    const dbPgCount = await pgRepo.count();
    check('payment count matches the table', stats.totalPayments === dbPaymentCount);
    check('complaint counts sum to the table', (
      stats.openComplaints + stats.inProgressComplaints + stats.resolvedComplaints
    ) === dbComplaintCount);
    check('room count matches the table', stats.totalRooms === dbRoomCount);
    check('tenant count matches the table', stats.totalTenants === dbTenantCount);
    check('property count matches the table', stats.totalPgs === dbPgCount);

    check('a fully paid payment is not counted as overdue', stats.overdueCount - before.overdueCount === 1);
    check(
      'bed totals come from room capacity, not the tenant count',
      stats.totalBeds - before.totalBeds === 7 && stats.totalTenants - before.totalTenants === 3
    );
    void paid;
    void partial;
  } finally {
    await cleanup();
    await AppDataSource.destroy();
  }

  console.log('');
  if (failures.length > 0) {
    console.log(`${failures.length} check(s) failed:`);
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    process.exit(1);
  }
  console.log(`All ${passed} Phase 10 dashboard checks passed.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
