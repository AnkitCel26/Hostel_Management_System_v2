import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import {
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import EditIcon from '@mui/icons-material/Edit';
import InputAdornment from '@mui/material/InputAdornment';
import PendingIcon from '@mui/icons-material/Pending';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { PageHeader } from '../../components/PageHeader';
import { PaymentStatusChip } from '../../components/PaymentStatusChip';
import { StatCard } from '../../components/StatCard';
import { PaymentFormDialog } from '../../components/admin/PaymentFormDialog';
import { useSnackbar } from '../../context/SnackbarContext';
import {
  GET_ALL_PAYMENTS_QUERY,
  GET_ALL_PGS_QUERY,
  GET_ALL_TENANTS_QUERY,
  GET_ADMIN_RENT_SUMMARY_QUERY
} from '../../graphql/operations';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type {
  PaymentStatus,
  Pg,
  RentPayment,
  RentPaymentPage,
  RentSummary,
  TenantPage
} from '../../types';
import { formatCurrency, formatDateOnly } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetAllPaymentsData {
  getAllRentPayments: RentPaymentPage;
}

interface GetRentSummaryData {
  getAdminRentSummary: RentSummary;
}

interface GetAllPgsData {
  getAllPgs: Pg[];
}

interface GetAllTenantsData {
  getAllTenants: TenantPage;
}

/** Table head cells: muted uppercase labels over a tinted strip. */
const headCellSx = {
  fontSize: '0.6875rem',
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: 'text.secondary',
  bgcolor: 'background.default',
  borderBottom: 2,
  borderColor: 'divider',
  py: 1.5
} as const;

/** Bordered icon button — same treatment as the rooms and tenants pages. */
const actionIconSx = {
  border: 1,
  borderColor: 'divider',
  borderRadius: 2,
  bgcolor: 'background.paper'
} as const;

export function AdminPaymentsPage() {
  const [searchParams] = useSearchParams();
  const { success } = useSnackbar();

  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [pgFilter, setPgFilter] = React.useState(() => searchParams.get('pgId') ?? '');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const [dialog, setDialog] = React.useState<{ open: boolean; payment: RentPayment | null }>({
    open: false,
    payment: null
  });

  // Filters returning to their default values restart pagination.
  React.useEffect(() => {
    setPage(0);
  }, [debouncedSearch, pgFilter, statusFilter]);

  const trimmedSearch = debouncedSearch.trim();
  const { data, previousData, loading, error, refetch } = useQuery<GetAllPaymentsData>(
    GET_ALL_PAYMENTS_QUERY,
    {
      variables: {
        search: trimmedSearch === '' ? undefined : trimmedSearch,
        pgId: pgFilter === '' ? undefined : pgFilter,
        status: statusFilter === '' ? undefined : (statusFilter as PaymentStatus),
        limit: rowsPerPage,
        offset: page * rowsPerPage
      },
      notifyOnNetworkStatusChange: true
    }
  );
  // The summary follows the property filter so the cards always describe the
  // same slice of data the table is showing.
  const summaryQuery = useQuery<GetRentSummaryData>(GET_ADMIN_RENT_SUMMARY_QUERY, {
    variables: { pgId: pgFilter === '' ? undefined : pgFilter }
  });
  const pgsQuery = useQuery<GetAllPgsData>(GET_ALL_PGS_QUERY);
  // Tenants for the form's picker (the list API is paginated; 100 covers the
  // picker for any realistic property count this phase supports).
  const tenantsQuery = useQuery<GetAllTenantsData>(GET_ALL_TENANTS_QUERY, {
    variables: { limit: 100 }
  });

  // Keep the previous page visible while a refetch is in flight (no flicker).
  const paymentPage = data?.getAllRentPayments ?? previousData?.getAllRentPayments ?? null;
  const payments = paymentPage?.items ?? [];
  const total = paymentPage?.total ?? 0;
  const summary = summaryQuery.data?.getAdminRentSummary ??
    summaryQuery.previousData?.getAdminRentSummary ?? null;
  const pgs = pgsQuery.data?.getAllPgs ?? [];
  const tenants = tenantsQuery.data?.getAllTenants.items ?? [];
  const hasActiveFilters = trimmedSearch !== '' || pgFilter !== '' || statusFilter !== '';

  const openCreate = () => setDialog({ open: true, payment: null });
  const openEdit = (payment: RentPayment) => setDialog({ open: true, payment });
  const closeDialog = () => setDialog({ open: false, payment: null });

  const handleSaved = (message: string): void => {
    closeDialog();
    success(message);
    void refetch();
    void summaryQuery.refetch();
  };

  const clearFilters = (): void => {
    setSearchInput('');
    setPgFilter('');
    setStatusFilter('');
  };

  return (
    <Box>
      <PageHeader
        title="Payments"
        subtitle="Record rent payments, track collection, and follow up on overdue amounts."
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Record Payment
          </Button>
        }
      />

      {/* Summary cards describe the current filter scope (all properties or one). */}
      {summary ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
            gap: { xs: 2, md: 3 },
            mb: 3
          }}
        >
          <StatCard
            icon={<CurrencyRupeeIcon />}
            label="Total billed"
            value={formatCurrency(summary.totalBilled)}
            sublabel={`${summary.totalPayments} payment${summary.totalPayments === 1 ? '' : 's'}`}
            tone="primary"
          />
          <StatCard
            icon={<CheckCircleIcon />}
            label="Collected"
            value={formatCurrency(summary.totalCollected)}
            sublabel={`${summary.paidCount} paid in full`}
            tone="success"
          />
          <StatCard
            icon={<PendingIcon />}
            label="Outstanding"
            value={formatCurrency(summary.outstandingAmount)}
            sublabel={`${summary.pendingCount} pending · ${summary.partialCount} partial`}
            tone="warning"
          />
          <StatCard
            icon={<WarningAmberIcon />}
            label="Overdue"
            value={String(summary.overdueCount)}
            sublabel={summary.overdueCount === 1 ? 'payment past due' : 'payments past due'}
            tone="error"
          />
        </Box>
      ) : null}

      {/* Toolbar */}
      <Card sx={{ mb: 3 }}>
        <CardContent
          sx={{
            p: 2,
            '&:last-child': { pb: 2 },
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { sm: 'center' },
            gap: 2
          }}
        >
          <TextField
            label="Search payments"
            placeholder="Tenant, email, room, or notes"
            size="small"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" fontSize="small" />
                </InputAdornment>
              )
            }}
            inputProps={{ 'aria-label': 'Search payments by tenant, email, room, or notes' }}
            sx={{ flexGrow: 1 }}
          />
          <TextField
            select
            label={PROPERTY_TERM.singular}
            size="small"
            value={pgFilter}
            onChange={(event) => setPgFilter(event.target.value)}
            sx={{ minWidth: { sm: 180 } }}
            inputProps={{ 'aria-label': `Filter payments by ${PROPERTY_TERM.singularLower}` }}
          >
            <MenuItem value="">All {PROPERTY_TERM.pluralLower}</MenuItem>
            {pgs.map((pg) => (
              <MenuItem key={pg.id} value={pg.id}>
                {pg.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Status"
            size="small"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            sx={{ minWidth: { sm: 140 } }}
            inputProps={{ 'aria-label': 'Filter payments by status' }}
          >
            <MenuItem value="">All statuses</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="partial">Partial</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="overdue">Overdue</MenuItem>
          </TextField>
          {paymentPage ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap' }}
            >
              {payments.length} of {total} payment{total === 1 ? '' : 's'}
            </Typography>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert title="Unable to load payments" message={error.message} />
          <Button variant="outlined" onClick={() => void refetch()}>
            Retry
          </Button>
        </Stack>
      ) : !paymentPage && loading ? (
        <LoadingIndicator label="Loading payments…" />
      ) : payments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ReceiptLongIcon fontSize="large" />}
            title={hasActiveFilters ? 'No payments match your filters' : 'No payments recorded yet'}
            message={
              hasActiveFilters
                ? 'Try a different search term or clear the filters.'
                : 'Record the first rent payment to start tracking collection.'
            }
            action={
              hasActiveFilters ? (
                <Button variant="outlined" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                  Record Payment
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card sx={{ position: 'relative', overflow: 'hidden' }}>
          {loading ? (
            <LinearProgress
              aria-label="Refreshing payments"
              sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}
            />
          ) : null}
          <TableContainer>
            <Table aria-label="Rent payments">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>Tenant</TableCell>
                  <TableCell sx={headCellSx}>{PROPERTY_TERM.singular}</TableCell>
                  <TableCell sx={headCellSx} align="right">Rent</TableCell>
                  <TableCell sx={headCellSx}>Due Date</TableCell>
                  <TableCell sx={headCellSx}>Paid Date</TableCell>
                  <TableCell sx={headCellSx}>Status</TableCell>
                  <TableCell sx={headCellSx} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {payment.tenant?.name ?? '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {payment.tenant?.user?.email ?? ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{payment.tenant?.pg?.name ?? '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {payment.tenant?.room
                          ? `Room ${payment.tenant.room.roomNumber}`
                          : 'No room assigned'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        {formatCurrency(payment.amount)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {payment.paidAmount > 0 ? `${formatCurrency(payment.paidAmount)} paid` : 'unpaid'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatDateOnly(payment.dueDate)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatDateOnly(payment.paidDate)}</Typography>
                    </TableCell>
                    <TableCell>
                      <PaymentStatusChip status={payment.status} />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={`Edit payment for ${payment.tenant?.name ?? 'tenant'}`}>
                        <IconButton
                          aria-label={`Edit payment for ${payment.tenant?.name ?? 'tenant'}`}
                          size="small"
                          onClick={() => openEdit(payment)}
                          sx={actionIconSx}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_event, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 20, 50]}
            sx={{ borderTop: 1, borderColor: 'divider' }}
          />
        </Card>
      )}

      <PaymentFormDialog
        open={dialog.open}
        payment={dialog.payment}
        tenants={tenants}
        onClose={closeDialog}
        onSaved={handleSaved}
      />
    </Box>
  );
}
