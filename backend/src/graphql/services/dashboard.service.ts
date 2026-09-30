import { GraphQLError } from 'graphql';

import { AppDataSource } from '../../config/db';
import { Complaint, ComplaintStatus } from '../../entities/complaint.entity';
import { Pg } from '../../entities/pg.entity';
import { PaymentStatus, RentPayment } from '../../entities/rent_payment.entity';
import { Room } from '../../entities/room.entity';
import { Tenant } from '../../entities/tenant.entity';
import { paymentStatusPredicates } from './payment.service';

/**
 * Admin dashboard statistics (Phase 10, FR-31, MRD §10.9).
 *
 * One query returns every number and list the dashboard renders, so the page
 * is a single round trip instead of stitching six paginated list queries on
 * the client (which would cap the counts at the page size).
 *
 * Every count is a real aggregate over the whole table — never a page length —
 * and the payment status counts reuse the SAME SQL predicates the payment
 * list filter and the Phase 6 rent summary use (see `payment.service.ts`), so
 * the dashboard can never disagree with the payments page about how many
 * payments are pending, partial, paid, or overdue.
 *
 * Occupancy comes from `rooms.occupiedCount`, the column Phase 5 keeps in sync
 * with tenant assignments inside the same transaction as the assignment, so
 * bed counts are trustworthy without re-joining tenants.
 */

export interface DashboardScopeArgs {
  pgId?: string | null;
}

/** One property's occupancy, for the dashboard's per-property chart. */
export interface PropertyOccupancy {
  pgId: string;
  pgName: string;
  totalRooms: number;
  occupiedRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  /** Whole percent, 0 when the property has no beds yet. */
  occupancyPercent: number;
}

export interface AdminDashboardStats {
  totalPgs: number;
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  /** Whole percent across the scoped properties, 0 when there are no beds. */
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
  occupancyByProperty: PropertyOccupancy[];
  recentPayments: RentPaymentPage;
  recentComplaints: ComplaintPage;
}

/** Default rows in the dashboard's recent-activity lists. */
const RECENT_LIMIT = 5;
const MAX_RECENT_LIMIT = 20;

/** Result shape of the recent-activity lists (mirrors RoomPage, MRD §16). */
export interface RentPaymentPage {
  items: RentPayment[];
  total: number;
  limit: number;
  offset: number;
}

export interface ComplaintPage {
  items: Complaint[];
  total: number;
  limit: number;
  offset: number;
}

/** Query args for the dashboard's recent-activity lists (pagination only). */
export interface RecentActivityArgs {
  limit?: number | null;
  offset?: number | null;
}

/** Postgres returns COUNT/SUM results as strings (bigint); parse defensively. */
function rawNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Rounded whole percent; 0 instead of NaN when the denominator is 0. */
function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100);
}

function badRequest(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } }
  });
}

function pgRepo() {
  return AppDataSource.getRepository(Pg);
}

function roomRepo() {
  return AppDataSource.getRepository(Room);
}

function tenantRepo() {
  return AppDataSource.getRepository(Tenant);
}

function paymentRepo() {
  return AppDataSource.getRepository(RentPayment);
}

function complaintRepo() {
  return AppDataSource.getRepository(Complaint);
}

/** Postgres uuid columns reject anything that is not a uuid with a 22P02 error. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Resolves the optional PG scope to a real row. A dashboard scoped to a
 * property that no longer exists is a client error, not an empty dashboard.
 */
async function resolveScope(pgId: string | null | undefined): Promise<Pg | null> {
  const trimmed = typeof pgId === 'string' ? pgId.trim() : '';
  if (trimmed.length === 0) {
    return null;
  }
  // Postgres uuid columns reject anything that is not a uuid with a 22P02
  // error, so a malformed id is reported like an id that does not exist.
  if (!isUuid(trimmed)) {
    throw badRequest('The selected PG does not exist');
  }
  const pg = await pgRepo().findOne({ where: { id: trimmed } });
  if (!pg) {
    throw badRequest('The selected PG does not exist');
  }
  return pg;
}

/** Property count (unfiltered, or 1 when scoped to one property). */
async function countPgs(scope: Pg | null): Promise<number> {
  return scope ? 1 : pgRepo().count();
}

/** Room/bed/occupancy totals for the scope. */
async function countRooms(
  scope: Pg | null
): Promise<{ totalRooms: number; occupiedRooms: number; totalBeds: number; occupiedBeds: number }> {
  const queryBuilder = roomRepo()
    .createQueryBuilder('room')
    .select('COUNT(*)', 'totalrooms')
    .addSelect('COUNT(*) FILTER (WHERE room."occupiedCount" > 0)', 'occupiedrooms')
    .addSelect('COALESCE(SUM(room."capacity"), 0)', 'totalbeds')
    .addSelect('COALESCE(SUM(room."occupiedCount"), 0)', 'occupiedbeds');

  if (scope) {
    queryBuilder.andWhere('room."pgId" = :pgId', { pgId: scope.id });
  }

  const raw = await queryBuilder.getRawOne<{
    totalrooms?: string;
    occupiedrooms?: string;
    totalbeds?: string;
    occupiedbeds?: string;
  }>();

  return {
    totalRooms: rawNumber(raw?.totalrooms),
    occupiedRooms: rawNumber(raw?.occupiedrooms),
    totalBeds: rawNumber(raw?.totalbeds),
    occupiedBeds: rawNumber(raw?.occupiedbeds)
  };
}

/** Tenant count for the scope. */
async function countTenants(scope: Pg | null): Promise<number> {
  const queryBuilder = tenantRepo().createQueryBuilder('tenant').select('COUNT(*)', 'total');
  if (scope) {
    queryBuilder.andWhere('tenant."pgId" = :pgId', { pgId: scope.id });
  }
  const raw = await queryBuilder.getRawOne<{ total?: string }>();
  return rawNumber(raw?.total);
}

/** Payment totals and live status counts, mirroring the Phase 6 summary. */
async function countPayments(
  scope: Pg | null
): Promise<{
  totalPayments: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  overdueCount: number;
  totalBilled: number;
  totalCollected: number;
}> {
  const predicates = paymentStatusPredicates();

  const queryBuilder = paymentRepo()
    .createQueryBuilder('payment')
    .select('COUNT(*)', 'totalpayments')
    .addSelect('COALESCE(SUM(payment."amount"), 0)', 'totalbilled')
    .addSelect('COALESCE(SUM(payment."paidAmount"), 0)', 'totalcollected')
    .addSelect(`COUNT(*) FILTER (WHERE ${predicates[PaymentStatus.Paid]})`, 'paidcount')
    .addSelect(`COUNT(*) FILTER (WHERE ${predicates[PaymentStatus.Overdue]})`, 'overduecount')
    .addSelect(`COUNT(*) FILTER (WHERE ${predicates[PaymentStatus.Partial]})`, 'partialcount')
    .addSelect(`COUNT(*) FILTER (WHERE ${predicates[PaymentStatus.Pending]})`, 'pendingcount');

  if (scope) {
    queryBuilder
      .leftJoin('payment.tenant', 'tenant')
      .andWhere('tenant."pgId" = :pgId', { pgId: scope.id });
  }

  const raw = await queryBuilder.getRawOne<{
    totalpayments?: string;
    totalbilled?: string;
    totalcollected?: string;
    paidcount?: string;
    overduecount?: string;
    partialcount?: string;
    pendingcount?: string;
  }>();

  return {
    totalPayments: rawNumber(raw?.totalpayments),
    paidCount: rawNumber(raw?.paidcount),
    overdueCount: rawNumber(raw?.overduecount),
    partialCount: rawNumber(raw?.partialcount),
    pendingCount: rawNumber(raw?.pendingcount),
    totalBilled: rawNumber(raw?.totalbilled),
    totalCollected: rawNumber(raw?.totalcollected)
  };
}

/** Complaint counts by stored status (complaint status needs no derivation). */
async function countComplaints(
  scope: Pg | null
): Promise<{ open: number; inProgress: number; resolved: number }> {
  // Complaint status is a stored enum with no derived variant, so the three
  // enum values are interpolated directly instead of bound as parameters
  // (they are compile-time constants from the entity, never user input).
  const queryBuilder = complaintRepo()
    .createQueryBuilder('complaint')
    .select('COUNT(*)', 'total')
    .addSelect(
      `COUNT(*) FILTER (WHERE complaint."status" = '${ComplaintStatus.Open}')`,
      'opencount'
    )
    .addSelect(
      `COUNT(*) FILTER (WHERE complaint."status" = '${ComplaintStatus.InProgress}')`,
      'inprogresscount'
    )
    .addSelect(
      `COUNT(*) FILTER (WHERE complaint."status" = '${ComplaintStatus.Resolved}')`,
      'resolvedcount'
    );

  if (scope) {
    queryBuilder.andWhere('complaint."pgId" = :pgId', { pgId: scope.id });
  }

  const raw = await queryBuilder.getRawOne<{
    opencount?: string;
    inprogresscount?: string;
    resolvedcount?: string;
  }>();

  return {
    open: rawNumber(raw?.opencount),
    inProgress: rawNumber(raw?.inprogresscount),
    resolved: rawNumber(raw?.resolvedcount)
  };
}

/** Announcement count for the scope. */
async function countAnnouncements(scope: Pg | null): Promise<number> {
  const queryBuilder = AppDataSource.getRepository(Pg)
    .createQueryBuilder('pg')
    .select('COUNT(announcement.id)', 'total')
    .leftJoin('pg.announcements', 'announcement');

  if (scope) {
    queryBuilder.andWhere('pg.id = :pgId', { pgId: scope.id });
  }

  const raw = await queryBuilder.getRawOne<{ total?: string }>();
  return rawNumber(raw?.total);
}

/**
 * Per-property occupancy rows for the dashboard chart, highest occupancy
 * first. Always the full property list (never narrowed by the scope) — the
 * chart answers "which property is filling up", which is only useful across
 * all of them, and a single-property scope simply yields one bar.
 */
async function getOccupancyByProperty(): Promise<PropertyOccupancy[]> {
  const raw = await pgRepo()
    .createQueryBuilder('pg')
    .select('pg.id', 'pgid')
    .addSelect('pg.name', 'pgname')
    .addSelect('COUNT(room.id)', 'totalrooms')
    .addSelect('COUNT(room.id) FILTER (WHERE room."occupiedCount" > 0)', 'occupiedrooms')
    .addSelect('COALESCE(SUM(room."capacity"), 0)', 'totalbeds')
    .addSelect('COALESCE(SUM(room."occupiedCount"), 0)', 'occupiedbeds')
    .leftJoin('pg.rooms', 'room')
    .groupBy('pg.id')
    .addGroupBy('pg.name')
    .orderBy('pg.name', 'ASC')
    .getRawMany<{
      pgid: string;
      pgname: string;
      totalrooms: string;
      occupiedrooms: string;
      totalbeds: string;
      occupiedbeds: string;
    }>();

  return raw
    .map((row) => {
      const totalBeds = rawNumber(row.totalbeds);
      const occupiedBeds = rawNumber(row.occupiedbeds);
      return {
        pgId: row.pgid,
        pgName: row.pgname,
        totalRooms: rawNumber(row.totalrooms),
        occupiedRooms: rawNumber(row.occupiedrooms),
        totalBeds,
        occupiedBeds,
        occupancyPercent: percent(occupiedBeds, totalBeds)
      };
    })
    .sort((a, b) => b.occupancyPercent - a.occupancyPercent);
}

/** Validates one pagination arg pair, defaulting to the dashboard's page size. */
function resolvePaging(args: RecentActivityArgs): { limit: number; offset: number } {
  const limit = args.limit ?? RECENT_LIMIT;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_RECENT_LIMIT) {
    throw badRequest(`limit must be a whole number between 1 and ${MAX_RECENT_LIMIT}`);
  }
  const offset = args.offset ?? 0;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw badRequest('offset must be a whole number of 0 or greater');
  }
  return { limit, offset };
}

/** The most recently updated payments, with the relations the table shows. */
async function getRecentPayments(
  scope: Pg | null,
  args: RecentActivityArgs
): Promise<RentPaymentPage> {
  const { limit, offset } = resolvePaging(args);

  const queryBuilder = paymentRepo()
    .createQueryBuilder('payment')
    .leftJoinAndSelect('payment.tenant', 'tenant')
    .leftJoinAndSelect('tenant.pg', 'pg')
    .leftJoinAndSelect('tenant.room', 'room')
    .orderBy('payment.updatedAt', 'DESC')
    .addOrderBy('payment.id', 'DESC');

  if (scope) {
    queryBuilder.andWhere('tenant."pgId" = :pgId', { pgId: scope.id });
  }

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}

/** The newest complaints, with the relations the table shows. */
async function getRecentComplaints(
  scope: Pg | null,
  args: RecentActivityArgs
): Promise<ComplaintPage> {
  const { limit, offset } = resolvePaging(args);

  const queryBuilder = complaintRepo()
    .createQueryBuilder('complaint')
    .leftJoinAndSelect('complaint.tenant', 'tenant')
    .leftJoinAndSelect('complaint.pg', 'pg')
    .leftJoinAndSelect('tenant.room', 'room')
    .orderBy('complaint.createdAt', 'DESC')
    .addOrderBy('complaint.id', 'DESC');

  if (scope) {
    queryBuilder.andWhere('complaint."pgId" = :pgId', { pgId: scope.id });
  }

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}

/**
 * Everything the admin dashboard renders, in one query. Counts, money totals,
 * the per-property occupancy chart series, and the two recent-activity lists.
 * Optionally scoped to one property.
 */
export async function getAdminDashboardStats(
  args: DashboardScopeArgs,
  recentArgs: RecentActivityArgs = {}
): Promise<AdminDashboardStats> {
  const scope = await resolveScope(args.pgId);

  const [totalPgs, rooms, totalTenants, payments, complaints, totalAnnouncements] = await Promise.all([
    countPgs(scope),
    countRooms(scope),
    countTenants(scope),
    countPayments(scope),
    countComplaints(scope),
    countAnnouncements(scope)
  ]);

  const [occupancyByProperty, recentPayments, recentComplaints] = await Promise.all([
    getOccupancyByProperty(),
    getRecentPayments(scope, recentArgs),
    getRecentComplaints(scope, recentArgs)
  ]);

  return {
    totalPgs,
    totalRooms: rooms.totalRooms,
    occupiedRooms: rooms.occupiedRooms,
    vacantRooms: Math.max(rooms.totalRooms - rooms.occupiedRooms, 0),
    totalBeds: rooms.totalBeds,
    occupiedBeds: rooms.occupiedBeds,
    occupancyPercent: percent(rooms.occupiedBeds, rooms.totalBeds),
    totalTenants,
    totalPayments: payments.totalPayments,
    paidCount: payments.paidCount,
    partialCount: payments.partialCount,
    pendingCount: payments.pendingCount,
    overdueCount: payments.overdueCount,
    totalBilled: payments.totalBilled,
    totalCollected: payments.totalCollected,
    // paidAmount <= amount is enforced on every write, so this never goes negative.
    outstandingAmount: payments.totalBilled - payments.totalCollected,
    openComplaints: complaints.open,
    inProgressComplaints: complaints.inProgress,
    resolvedComplaints: complaints.resolved,
    totalAnnouncements,
    occupancyByProperty,
    recentPayments,
    recentComplaints
  };
}
