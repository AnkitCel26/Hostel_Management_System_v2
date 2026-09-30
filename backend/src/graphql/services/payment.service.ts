import { GraphQLError } from 'graphql';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/db';
import { Pg } from '../../entities/pg.entity';
import { PaymentStatus, RentPayment } from '../../entities/rent_payment.entity';
import { Tenant } from '../../entities/tenant.entity';

export interface CreateRentPaymentInput {
  tenantId: string;
  amount: number;
  paidAmount?: number | null;
  dueDate: string;
  paidDate?: string | null;
  notes?: string | null;
}

export interface UpdateRentPaymentInput {
  amount?: number | null;
  paidAmount?: number | null;
  dueDate?: string | null;
  paidDate?: string | null;
  notes?: string | null;
}

export interface PayRentInput {
  paymentId: string;
  amount: number;
}

export interface RentPaymentListArgs {
  search?: string | null;
  pgId?: string | null;
  tenantId?: string | null;
  status?: PaymentStatus | null;
  month?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface RentSummaryArgs {
  pgId?: string | null;
  month?: string | null;
}

export interface PaymentHistoryArgs {
  limit?: number | null;
  offset?: number | null;
}

export interface RentPaymentPage {
  items: RentPayment[];
  total: number;
  limit: number;
  offset: number;
}

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function forbidden(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'FORBIDDEN', http: { status: 403 } }
  });
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23503'
  );
}

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

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function validateRequiredDate(raw: string | null | undefined, label: string): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!DATE_PATTERN.test(trimmed)) {
    throw badRequest(`${label} must be a date in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw badRequest(`${label} is not a valid calendar date`);
  }
  return trimmed;
}

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

function validatePaidAmount(raw: number | null | undefined, amount: number): number {
  const paidAmount =
    raw === undefined || raw === null ? 0 : validateInt(raw, 0, AMOUNT_MAX, 'Paid amount');
  if (paidAmount > amount) {
    throw badRequest('Paid amount cannot exceed the rent amount');
  }
  return paidAmount;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

interface MonthRange {
  start: string;
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
  const start = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));
  return {
    start: start.toISOString().slice(0, 10),
    endExclusive: endExclusive.toISOString().slice(0, 10)
  };
}

const STATUS_VALUES = new Set<string>(Object.values(PaymentStatus));

function validateStatusFilter(raw: unknown): PaymentStatus | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string' || !STATUS_VALUES.has(raw)) {
    throw badRequest('Status must be one of: pending, partial, paid, overdue');
  }
  return raw as PaymentStatus;
}

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

interface PaymentWriteState {
  status: PaymentStatus;
  paidDate: string | null;
}

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

async function lockPayment(manager: EntityManager, id: string): Promise<RentPayment> {
  if (!isUuid(id)) {
    throw notFound('Payment not found');
  }
  const payment = await manager
    .getRepository(RentPayment)
    .createQueryBuilder('payment')
    .leftJoinAndSelect('payment.tenant', 'tenant')
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
    saved.tenant = tenant;
    return saved;
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw badRequest('The selected tenant no longer exists');
    }
    throw error;
  }
}

export async function updateRentPayment(id: string, input: UpdateRentPaymentInput): Promise<RentPayment> {
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
    saved.tenant = payment.tenant;
    return saved;
  });
}

export async function payRent(userId: string, input: PayRentInput): Promise<RentPayment> {
  const payAmount = validateInt(input.amount, AMOUNT_MIN, AMOUNT_MAX, 'Payment amount');
  const paymentId = typeof input.paymentId === 'string' ? input.paymentId.trim() : '';
  if (paymentId.length === 0) {
    throw badRequest('A payment id is required');
  }

  return AppDataSource.transaction(async (manager) => {
    const payment = await lockPayment(manager, paymentId);

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
    saved.tenant = payment.tenant;
    return saved;
  });
}

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

const SQL_TODAY = "(now() AT TIME ZONE 'utc')::date";

const STATUS_PREDICATES: Record<PaymentStatus, string> = {
  [PaymentStatus.Paid]: 'payment."paidAmount" >= payment."amount"',
  [PaymentStatus.Overdue]: `payment."paidAmount" < payment."amount" AND payment."dueDate" < ${SQL_TODAY}`,
  [PaymentStatus.Partial]: `payment."paidAmount" > 0 AND payment."paidAmount" < payment."amount" AND payment."dueDate" >= ${SQL_TODAY}`,
  [PaymentStatus.Pending]: `payment."paidAmount" = 0 AND payment."paidAmount" < payment."amount" AND payment."dueDate" >= ${SQL_TODAY}`
};

export function paymentStatusPredicates(): Record<PaymentStatus, string> {
  return STATUS_PREDICATES;
}

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
    outstandingAmount: totalBilled - totalCollected,
    pendingCount: rawNumber(raw?.pendingcount),
    partialCount: rawNumber(raw?.partialcount),
    paidCount: rawNumber(raw?.paidcount),
    overdueCount: rawNumber(raw?.overduecount)
  };
}
