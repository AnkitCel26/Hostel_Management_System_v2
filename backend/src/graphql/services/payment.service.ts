import { GraphQLError } from 'graphql';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/db';
import { Pg } from '../../entities/pg.entity';
import { PaymentStatus, RentPayment } from '../../entities/rent_payment.entity';
import { Tenant } from '../../entities/tenant.entity';

/**
 * Rent and payment management (Phase 6): payment creation and update, the
 * tenant-facing payment history, and the admin payment list, summary, and
 * history (FR-18 through FR-21).
 *
 * Payment status is never accepted from input. It is DERIVED — in one pure
 * function, `resolvePaymentStatus` — from paidAmount vs amount and the due
 * date vs today, in this priority:
 *
 *   1. paidAmount >= amount      -> paid
 *   2. dueDate < today (unpaid)  -> overdue
 *   3. paidAmount > 0            -> partial
 *   4. otherwise                 -> pending
 *
 * The same rule is applied in three places on purpose, and all three must
 * change together if the rule ever changes:
 *   - at write time, `resolveWriteState` stores a snapshot in
 *     rent_payments.status;
 *   - at read time, the RentPayment.status field resolver returns the LIVE
 *     status, so a stored "pending" is displayed as "overdue" once its due
 *     date passes — statuses can never go stale in responses;
 *   - `STATUS_PREDICATES` mirrors the rule as SQL for the status filter and
 *     the summary counts.
 *
 * paidDate is system-managed alongside status: it exists only while the
 * payment is fully paid (defaulting to today when the caller does not supply
 * a date) and is cleared the moment the payment is no longer fully paid.
 *
 * Updates run inside a transaction that row-locks the payment (the same
 * pessimistic-lock pattern as Phase 5), so concurrent read-modify-write
 * updates of one payment serialize instead of losing updates.
 */

export interface CreateRentPaymentInput {
  tenantId: string;
  amount: number;
  paidAmount?: number | null;
  dueDate: string;
  paidDate?: string | null;
  notes?: string | null;
}

/**
 * Partial update semantics (same as the PG/room/tenant services): undefined
 * and null leave a field unchanged, '' clears the notes. Status and paidDate
 * are never taken from input — they are re-derived on every write.
 */
export interface UpdateRentPaymentInput {
  amount?: number | null;
  paidAmount?: number | null;
  dueDate?: string | null;
  paidDate?: string | null;
  notes?: string | null;
}

/**
 * Tenant self-service payment (tenant-portal "Pay" action). The tenant pays
 * any amount toward one of their own payments; paidAmount accumulates until
 * it reaches amount, at which point the payment is fully paid.
 */
export interface PayRentInput {
  paymentId: string;
  amount: number;
}

/** Query args for the paginated, filterable rent payment list. */
export interface RentPaymentListArgs {
  search?: string | null;
  pgId?: string | null;
  tenantId?: string | null;
  status?: PaymentStatus | null;
  month?: string | null;
  limit?: number | null;
  offset?: number | null;
}

/** Query args for the admin rent summary (optional PG and month scope). */
export interface RentSummaryArgs {
  pgId?: string | null;
  month?: string | null;
}

/** Query args for the tenant/admin history feeds (pagination only). */
export interface PaymentHistoryArgs {
  limit?: number | null;
  offset?: number | null;
}

/** Result shape for the paginated payment collections (mirrors RoomPage, MRD §16). */
export interface RentPaymentPage {
  items: RentPayment[];
  total: number;
  limit: number;
  offset: number;
}

/** Result shape for the admin rent summary query. */
export interface RentSummary {
  totalPayments: number;
  totalBilled: number;
  totalCollected: number;
  outstandingAmount: number;
  pendingCount: number;
  partialCount: number;
  paidCount: number;
  overdueCount: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const AMOUNT_MIN = 1;
const AMOUNT_MAX = 10_000_000;
const NOTES_MAX = 2000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function paymentRepo() {
  return AppDataSource.getRepository(RentPayment);
}

function tenantRepo() {
  return AppDataSource.getRepository(Tenant);
}

function pgRepo() {
  return AppDataSource.getRepository(Pg);
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

/** Postgres uuid columns reject anything that is not a uuid with a 22P02 error. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guards the id inputs: a malformed id can never match a row, so it is
 * reported with the same BAD_USER_INPUT / NOT_FOUND answer as a
 * well-formed id that does not exist. Without this guard the uuid column
 * error would surface as an internal server error.
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Ownership violation (a tenant may only pay their own rent payments). */
function forbidden(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'FORBIDDEN', http: { status: 403 } }
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

/** Optional text: '' and null both persist as null (no value). */
function optionalText(raw: string | null | undefined, max: number, label: string): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length > max) {
    throw badRequest(`${label} must be ${max} characters or fewer`);
  }
  return trimmed.length === 0 ? null : trimmed;
}

function validateInt(
  raw: number | null | undefined,
  min: number,
  max: number,
  label: string
): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min || raw > max) {
    throw badRequest(`${label} must be a whole number between ${min} and ${max}`);
  }
  return raw;
}

/** Today's UTC date as YYYY-MM-DD (ISO dates compare correctly as strings). */
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Required calendar date (dueDate): a real YYYY-MM-DD date. */
function validateRequiredDate(raw: string | null | undefined, label: string): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!DATE_PATTERN.test(trimmed)) {
    throw badRequest(`${label} must be a date in YYYY-MM-DD format`);
  }
  // A round-trip through UTC rejects impossible dates such as 2026-02-30.
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw badRequest(`${label} is not a valid calendar date`);
  }
  return trimmed;
}

/**
 * Optional calendar date (paidDate): '' and null both mean "not provided".
 * A paid date can never lie in the future.
 */
function validateOptionalDate(raw: string | null | undefined, label: string): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) {
    return null;
  }
  if (!DATE_PATTERN.test(trimmed)) {
    throw badRequest(`${label} must be a date in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw badRequest(`${label} is not a valid calendar date`);
  }
  if (trimmed > todayString()) {
    throw badRequest(`${label} cannot be in the future`);
  }
  return trimmed;
}

/** paidAmount defaults to 0 and can never exceed the rent amount. */
function validatePaidAmount(raw: number | null | undefined, amount: number): number {
  const paidAmount =
    raw === undefined || raw === null ? 0 : validateInt(raw, 0, AMOUNT_MAX, 'Paid amount');
  if (paidAmount > amount) {
    throw badRequest('Paid amount cannot exceed the rent amount');
  }
  return paidAmount;
}

/**
 * Optional billing-month filter, as `YYYY-MM`. A payment belongs to the month
 * of its due date — that is the month the rent is billed for — so the filter
 * resolves to a half-open due-date range [first day, first day of next month)
 * and both the list and the summary are scoped by the identical range.
 * '' and null mean "every month".
 */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A resolved half-open due-date range for one billing month. */
interface MonthRange {
  /** First day of the month, YYYY-MM-DD. */
  start: string;
  /** First day of the next month, YYYY-MM-DD (exclusive upper bound). */
  endExclusive: string;
}

function validateMonthFilter(raw: string | null | undefined): MonthRange | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) {
    return null;
  }
  if (!MONTH_PATTERN.test(trimmed)) {
    throw badRequest('Month must be in YYYY-MM format');
  }
  const [year, month] = trimmed.split('-').map(Number);
  // Day 0 of the next month is the first day of this one (JS normalises the
  // overflow), so this handles December rolling into the next year for free.
  const start = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));
  return {
    start: start.toISOString().slice(0, 10),
    endExclusive: endExclusive.toISOString().slice(0, 10)
  };
}

const STATUS_VALUES = new Set<string>(Object.values(PaymentStatus));

/** Backstop for non-GraphQL callers: the status filter must be a real enum value. */
function validateStatusFilter(raw: unknown): PaymentStatus | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string' || !STATUS_VALUES.has(raw)) {
    throw badRequest('Status must be one of: pending, partial, paid, overdue');
  }
  return raw as PaymentStatus;
}

/**
 * The single status-derivation rule (see the file header). Pure: same input,
 * same output, so it is safe to use at both write and read time.
 */
export function resolvePaymentStatus(
  payment: Pick<RentPayment, 'amount' | 'paidAmount' | 'dueDate'>
): PaymentStatus {
  if (payment.paidAmount >= payment.amount) {
    return PaymentStatus.Paid;
  }
  if (payment.dueDate < todayString()) {
    return PaymentStatus.Overdue;
  }
  if (payment.paidAmount > 0) {
    return PaymentStatus.Partial;
  }
  return PaymentStatus.Pending;
}

/** The status/paidDate pair a write must persist. */
interface PaymentWriteState {
  status: PaymentStatus;
  paidDate: string | null;
}

/**
 * Derives the stored status and paidDate for a write. A paid date may only be
 * supplied (or kept) while the payment is fully paid; otherwise it is an
 * error to pass one, rather than silently dropping the caller's data.
 */
function resolveWriteState(
  amount: number,
  paidAmount: number,
  dueDate: string,
  paidDate: string | null,
  previousPaidDate: string | null | undefined
): PaymentWriteState {
  if (paidDate !== null && paidAmount < amount) {
    throw badRequest('A paid date can only be set while the payment is fully paid');
  }
  const status = resolvePaymentStatus({ amount, paidAmount, dueDate });
  if (status === PaymentStatus.Paid) {
    return {
      status,
      paidDate: paidDate ?? previousPaidDate ?? todayString()
    };
  }
  return { status, paidDate: null };
}

/** Resolves the tenant a payment belongs to (payments are created by admins). */
async function findTenantOrThrow(tenantId: string | null | undefined): Promise<Tenant> {
  const trimmed = typeof tenantId === 'string' ? tenantId.trim() : '';
  if (trimmed.length === 0) {
    throw badRequest('A tenant id is required');
  }
  if (!isUuid(trimmed)) {
    throw badRequest('The selected tenant does not exist');
  }
  const tenant = await tenantRepo().findOne({ where: { id: trimmed } });
  if (!tenant) {
    throw badRequest('The selected tenant does not exist');
  }
  return tenant;
}

/**
 * Locks the payment row (SELECT ... FOR UPDATE) and loads it with its tenant.
 * Concurrent updates of the same payment serialize here, so the
 * read-modify-write status/paidDate derivation can never interleave or lose
 * updates. Only the payment row is locked — the tenant is read-only
 * reference data for this operation.
 */
async function lockPayment(manager: EntityManager, id: string): Promise<RentPayment> {
  if (!isUuid(id)) {
    throw notFound('Payment not found');
  }
  const payment = await manager
    .getRepository(RentPayment)
    .createQueryBuilder('payment')
    .leftJoinAndSelect('payment.tenant', 'tenant')
    // tenant.user is read-only reference data for the tenant self-service
    // payment ownership check (the row lock stays on the payment only).
    .leftJoinAndSelect('tenant.user', 'user')
    .setLock('pessimistic_write', undefined, ['payment'])
    .where('payment.id = :id', { id })
    .getOne();
  if (!payment) {
    throw notFound('Payment not found');
  }
  return payment;
}

export async function createRentPayment(input: CreateRentPaymentInput): Promise<RentPayment> {
  const amount = validateInt(input.amount, AMOUNT_MIN, AMOUNT_MAX, 'Amount');
  const paidAmount = validatePaidAmount(input.paidAmount, amount);
  const dueDate = validateRequiredDate(input.dueDate, 'Due date');
  const paidDate = validateOptionalDate(input.paidDate, 'Paid date');
  const notes = optionalText(input.notes, NOTES_MAX, 'Notes');

  const tenant = await findTenantOrThrow(input.tenantId);
  const state = resolveWriteState(amount, paidAmount, dueDate, paidDate, null);

  const payment = paymentRepo().create({
    tenant,
    amount,
    paidAmount,
    dueDate,
    paidDate: state.paidDate,
    status: state.status,
    notes
  });

  try {
    const saved = await paymentRepo().save(payment);
    // create()/save() may return relation clones of the input literal, so
    // re-attach the live tenant entity (same convention as Phase 5).
    saved.tenant = tenant;
    return saved;
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      // The tenant was deleted between the friendly check and the insert.
      throw badRequest('The selected tenant no longer exists');
    }
    throw error;
  }
}

export async function updateRentPayment(id: string, input: UpdateRentPaymentInput): Promise<RentPayment> {
  // Scalar validation runs before the transaction (fail fast, no locks yet).
  const amount =
    input.amount !== undefined && input.amount !== null
      ? validateInt(input.amount, AMOUNT_MIN, AMOUNT_MAX, 'Amount')
      : undefined;
  const paidAmount =
    input.paidAmount !== undefined && input.paidAmount !== null
      ? validateInt(input.paidAmount, 0, AMOUNT_MAX, 'Paid amount')
      : undefined;
  const dueDate =
    input.dueDate !== undefined && input.dueDate !== null
      ? validateRequiredDate(input.dueDate, 'Due date')
      : undefined;
  // '' / null / undefined all mean "not provided" here — paidDate is
  // system-managed and cannot be cleared directly (see resolveWriteState).
  const paidDate =
    input.paidDate !== undefined && input.paidDate !== null
      ? validateOptionalDate(input.paidDate, 'Paid date')
      : null;
  const notes =
    input.notes !== undefined && input.notes !== null
      ? optionalText(input.notes, NOTES_MAX, 'Notes')
      : undefined;

  return AppDataSource.transaction(async (manager) => {
    const payment = await lockPayment(manager, id);

    const nextAmount = amount ?? payment.amount;
    const nextPaidAmount = paidAmount ?? payment.paidAmount;
    if (nextPaidAmount > nextAmount) {
      throw badRequest('Paid amount cannot exceed the rent amount');
    }
    const nextDueDate = dueDate ?? payment.dueDate;

    const state = resolveWriteState(
      nextAmount,
      nextPaidAmount,
      nextDueDate,
      paidDate,
      payment.paidDate ?? null
    );

    payment.amount = nextAmount;
    payment.paidAmount = nextPaidAmount;
    payment.dueDate = nextDueDate;
    payment.status = state.status;
    payment.paidDate = state.paidDate;
    if (notes !== undefined) {
      payment.notes = notes;
    }

    const saved = await manager.getRepository(RentPayment).save(payment);
    // Re-attach the live tenant in case save() returned a relation clone.
    saved.tenant = payment.tenant;
    return saved;
  });
}

/**
 * Tenant self-service payment (FR-20 extension): adds to the amount already
 * paid on one of the caller's own rent payments. The pay amount may be any
 * part of the remaining rent — paidAmount accumulates until it reaches
 * amount, at which point the payment becomes fully paid. Status and paidDate
 * are re-derived exactly as on every other write, and the same row lock as
 * updateRentPayment serializes concurrent payments on one record.
 */
export async function payRent(userId: string, input: PayRentInput): Promise<RentPayment> {
  const payAmount = validateInt(input.amount, AMOUNT_MIN, AMOUNT_MAX, 'Payment amount');
  const paymentId = typeof input.paymentId === 'string' ? input.paymentId.trim() : '';
  if (paymentId.length === 0) {
    throw badRequest('A payment id is required');
  }

  return AppDataSource.transaction(async (manager) => {
    const payment = await lockPayment(manager, paymentId);

    // Ownership: a tenant can only pay their own rent payments.
    if (payment.tenant.user.id !== userId) {
      throw forbidden('You can only pay your own rent payments');
    }

    const remaining = payment.amount - payment.paidAmount;
    if (remaining <= 0) {
      throw badRequest('This payment is already fully paid');
    }
    if (payAmount > remaining) {
      throw badRequest(`Payment amount cannot exceed the remaining rent of ${remaining}`);
    }

    const nextPaidAmount = payment.paidAmount + payAmount;
    const state = resolveWriteState(
      payment.amount,
      nextPaidAmount,
      payment.dueDate,
      null,
      payment.paidDate ?? null
    );

    payment.paidAmount = nextPaidAmount;
    payment.status = state.status;
    payment.paidDate = state.paidDate;

    const saved = await manager.getRepository(RentPayment).save(payment);
    // Re-attach the live tenant in case save() returned a relation clone.
    saved.tenant = payment.tenant;
    return saved;
  });
}

/**
 * Searchable, paginated, filterable rent payment list (FR-21). Search matches
 * the tenant name, the linked user's email, the tenant's room number, and
 * the payment notes case-insensitively. Filters: one PG, one tenant, one live
 * status, one billing month. Newest due dates first with a deterministic id
 * tiebreak, mirroring the room/tenant lists (MRD §16: consistent pagination).
 */
export async function getAllRentPayments(args: RentPaymentListArgs): Promise<RentPaymentPage> {
  const limit = args.limit ?? DEFAULT_PAGE_SIZE;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw badRequest(`limit must be a whole number between 1 and ${MAX_PAGE_SIZE}`);
  }
  const offset = args.offset ?? 0;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw badRequest('offset must be a whole number of 0 or greater');
  }
  const status = validateStatusFilter(args.status);
  const monthRange = validateMonthFilter(args.month);

  const queryBuilder = paymentRepo()
    .createQueryBuilder('payment')
    .leftJoinAndSelect('payment.tenant', 'tenant')
    .leftJoinAndSelect('tenant.user', 'user')
    .leftJoinAndSelect('tenant.pg', 'pg')
    .leftJoinAndSelect('tenant.room', 'room')
    .orderBy('payment.dueDate', 'DESC')
    .addOrderBy('payment.createdAt', 'DESC')
    .addOrderBy('payment.id', 'DESC');

  const pgId = typeof args.pgId === 'string' ? args.pgId.trim() : '';
  if (pgId.length > 0) {
    if (!isUuid(pgId)) {
      throw badRequest('The selected PG does not exist');
    }
    const pg = await pgRepo().findOne({ where: { id: pgId } });
    if (!pg) {
      throw badRequest('The selected PG does not exist');
    }
    queryBuilder.andWhere('pg.id = :pgId', { pgId: pg.id });
  }

  const tenantId = typeof args.tenantId === 'string' ? args.tenantId.trim() : '';
  if (tenantId.length > 0) {
    if (!isUuid(tenantId)) {
      throw badRequest('The selected tenant does not exist');
    }
    const tenant = await tenantRepo().findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw badRequest('The selected tenant does not exist');
    }
    queryBuilder.andWhere('tenant.id = :tenantId', { tenantId: tenant.id });
  }

  if (status !== null) {
    // The live SQL mirror of resolvePaymentStatus — filtering by status must
    // agree with what the status field resolver displays.
    queryBuilder.andWhere(STATUS_PREDICATES[status]);
  }

  if (monthRange !== null) {
    queryBuilder.andWhere('payment."dueDate" >= :monthStart', { monthStart: monthRange.start });
    queryBuilder.andWhere('payment."dueDate" < :monthEnd', { monthEnd: monthRange.endExclusive });
  }

  const search = typeof args.search === 'string' ? args.search.trim() : '';
  if (search.length > 0) {
    queryBuilder.andWhere(
      '(LOWER(tenant.name) LIKE :term OR LOWER(user.email) LIKE :term OR LOWER(room.roomNumber) LIKE :term OR LOWER(payment.notes) LIKE :term)',
      { term: `%${search.toLowerCase()}%` }
    );
  }

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}

/**
 * The tenant-facing payment history (FR-20): the current user's own
 * payments, newest due dates first. A Tenant-role user without a tenant
 * record (no assignment yet) sees an empty page — a valid empty state, not
 * an error. Scope is forced to the caller's tenant record; no tenantId is
 * accepted from input.
 */
export async function getRentPaymentHistory(
  userId: string,
  args: PaymentHistoryArgs
): Promise<RentPaymentPage> {
  const limit = args.limit ?? DEFAULT_PAGE_SIZE;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw badRequest(`limit must be a whole number between 1 and ${MAX_PAGE_SIZE}`);
  }
  const offset = args.offset ?? 0;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw badRequest('offset must be a whole number of 0 or greater');
  }

  const tenant = await tenantRepo().findOne({ where: { user: { id: userId } } });
  if (!tenant) {
    return { items: [], total: 0, limit, offset };
  }

  const queryBuilder = paymentRepo()
    .createQueryBuilder('payment')
    .leftJoinAndSelect('payment.tenant', 'tenant')
    .where('tenant.id = :tenantId', { tenantId: tenant.id })
    .orderBy('payment.dueDate', 'DESC')
    .addOrderBy('payment.createdAt', 'DESC')
    .addOrderBy('payment.id', 'DESC');

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}

/**
 * The admin history view (FR-21): recently updated payment records, newest
 * activity first — the latest receipts and edits. Same page shape as the
 * payment list (MRD §16: consistent pagination).
 */
export async function getAdminRentHistory(args: PaymentHistoryArgs): Promise<RentPaymentPage> {
  const limit = args.limit ?? DEFAULT_PAGE_SIZE;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw badRequest(`limit must be a whole number between 1 and ${MAX_PAGE_SIZE}`);
  }
  const offset = args.offset ?? 0;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw badRequest('offset must be a whole number of 0 or greater');
  }

  const queryBuilder = paymentRepo()
    .createQueryBuilder('payment')
    .leftJoinAndSelect('payment.tenant', 'tenant')
    .leftJoinAndSelect('tenant.pg', 'pg')
    .orderBy('payment.updatedAt', 'DESC')
    .addOrderBy('payment.id', 'DESC');

  const total = await queryBuilder.getCount();
  const items = await queryBuilder.skip(offset).take(limit).getMany();
  return { items, total, limit, offset };
}

/**
 * The SQL mirror of the status-derivation rule. Column names are written
 * explicitly (quoted, as created by the migration) so the predicates are
 * deterministic raw SQL, and SQL_TODAY matches the UTC "today" used by
 * todayString() so the database and the resolver can never disagree.
 */
const SQL_TODAY = "(now() AT TIME ZONE 'utc')::date";

const STATUS_PREDICATES: Record<PaymentStatus, string> = {
  [PaymentStatus.Paid]: 'payment."paidAmount" >= payment."amount"',
  [PaymentStatus.Overdue]: `payment."paidAmount" < payment."amount" AND payment."dueDate" < ${SQL_TODAY}`,
  [PaymentStatus.Partial]: `payment."paidAmount" > 0 AND payment."paidAmount" < payment."amount" AND payment."dueDate" >= ${SQL_TODAY}`,
  [PaymentStatus.Pending]: `payment."paidAmount" = 0 AND payment."paidAmount" < payment."amount" AND payment."dueDate" >= ${SQL_TODAY}`
};

/**
 * Read-only access to the status predicates above, for other services that
 * aggregate payment statuses (the Phase 10 dashboard). They are SQL
 * expressions rooted at the `payment` alias, so a caller reusing them must
 * query through the RentPayment repository with the `payment` alias.
 * Exported rather than duplicated so the derivation rule has exactly one
 * definition.
 */
export function paymentStatusPredicates(): Record<PaymentStatus, string> {
  return STATUS_PREDICATES;
}

/** Postgres returns COUNT/SUM results as strings (bigint); parse defensively. */
interface RentSummaryRaw {
  totalpayments?: string | number | null;
  totalbilled?: string | number | null;
  totalcollected?: string | number | null;
  paidcount?: string | number | null;
  overduecount?: string | number | null;
  partialcount?: string | number | null;
  pendingcount?: string | number | null;
}

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

/**
 * Aggregate payment statistics for the admin summary (FR-21), optionally
 * scoped to one PG and one billing month. The status counts use the same live
 * SQL predicates as the payment list's status filter, and the month scope
 * resolves to the same due-date range, so summary and list always agree.
 */
export async function getAdminRentSummary(args: RentSummaryArgs): Promise<RentSummary> {
  const queryBuilder = paymentRepo()
    .createQueryBuilder('payment')
    .select('COUNT(*)', 'totalpayments')
    .addSelect('COALESCE(SUM(payment."amount"), 0)', 'totalbilled')
    .addSelect('COALESCE(SUM(payment."paidAmount"), 0)', 'totalcollected')
    .addSelect(`COUNT(*) FILTER (WHERE ${STATUS_PREDICATES[PaymentStatus.Paid]})`, 'paidcount')
    .addSelect(`COUNT(*) FILTER (WHERE ${STATUS_PREDICATES[PaymentStatus.Overdue]})`, 'overduecount')
    .addSelect(`COUNT(*) FILTER (WHERE ${STATUS_PREDICATES[PaymentStatus.Partial]})`, 'partialcount')
    .addSelect(`COUNT(*) FILTER (WHERE ${STATUS_PREDICATES[PaymentStatus.Pending]})`, 'pendingcount');

  const pgId = typeof args.pgId === 'string' ? args.pgId.trim() : '';
  if (pgId.length > 0) {
    if (!isUuid(pgId)) {
      throw badRequest('The selected PG does not exist');
    }
    const pg = await pgRepo().findOne({ where: { id: pgId } });
    if (!pg) {
      throw badRequest('The selected PG does not exist');
    }
    queryBuilder
      .leftJoin('payment.tenant', 'tenant')
      .leftJoin('tenant.pg', 'pg')
      .andWhere('pg.id = :pgId', { pgId: pg.id });
  }

  // The month scope uses the same range as the list filter, so the summary
  // cards always describe exactly the rows the table is showing.
  const monthRange = validateMonthFilter(args.month);
  if (monthRange !== null) {
    queryBuilder.andWhere('payment."dueDate" >= :monthStart', { monthStart: monthRange.start });
    queryBuilder.andWhere('payment."dueDate" < :monthEnd', { monthEnd: monthRange.endExclusive });
  }

  const raw = await queryBuilder.getRawOne<RentSummaryRaw>();
  const totalPayments = rawNumber(raw?.totalpayments);
  const totalBilled = rawNumber(raw?.totalbilled);
  const totalCollected = rawNumber(raw?.totalcollected);

  return {
    totalPayments,
    totalBilled,
    totalCollected,
    // paidAmount <= amount is enforced on every write, so this never goes negative.
    outstandingAmount: totalBilled - totalCollected,
    pendingCount: rawNumber(raw?.pendingcount),
    partialCount: rawNumber(raw?.partialcount),
    paidCount: rawNumber(raw?.paidcount),
    overdueCount: rawNumber(raw?.overduecount)
  };
}
