import React from 'react';
import { useQuery } from '@apollo/client';
import {
  Box,
  Button,
  Card,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { PageHeader } from '../../components/PageHeader';
import { PaymentStatusChip } from '../../components/PaymentStatusChip';
import { GET_TENANT_PAYMENT_HISTORY_QUERY } from '../../graphql/operations';
import type { RentPaymentPage } from '../../types';
import { formatCurrency, formatDateOnly } from '../../utils/format';

interface GetTenantHistoryData {
  getRentPaymentHistory: RentPaymentPage;
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

export function TenantPaymentsPage() {
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const { data, previousData, loading, error, refetch } = useQuery<GetTenantHistoryData>(
    GET_TENANT_PAYMENT_HISTORY_QUERY,
    {
      variables: { limit: rowsPerPage, offset: page * rowsPerPage },
      notifyOnNetworkStatusChange: true
    }
  );

  // Keep the previous page visible while a refetch is in flight (no flicker).
  const paymentPage = data?.getRentPaymentHistory ?? previousData?.getRentPaymentHistory ?? null;
  const payments = paymentPage?.items ?? [];
  const total = paymentPage?.total ?? 0;

  return (
    <Box>
      <PageHeader
        title="My Payments"
        subtitle="Your rent records, payment status, and paid dates."
      />

      {error ? (
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert title="Unable to load your payments" message={error.message} />
          <Button variant="outlined" onClick={() => void refetch()}>
            Retry
          </Button>
        </Stack>
      ) : !paymentPage && loading ? (
        <LoadingIndicator label="Loading your payments…" />
      ) : payments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ReceiptLongIcon fontSize="large" />}
            title="No payments yet"
            message="When your property manager records a rent payment for you, it will show up here."
          />
        </Card>
      ) : (
        <Card sx={{ position: 'relative', overflow: 'hidden' }}>
          {loading ? (
            <LinearProgress
              aria-label="Refreshing your payments"
              sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}
            />
          ) : null}
          <TableContainer>
            <Table aria-label="My rent payments">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>Due Date</TableCell>
                  <TableCell sx={headCellSx} align="right">Rent</TableCell>
                  <TableCell sx={headCellSx} align="right">Paid</TableCell>
                  <TableCell sx={headCellSx}>Paid Date</TableCell>
                  <TableCell sx={headCellSx}>Status</TableCell>
                  <TableCell sx={headCellSx}>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {formatDateOnly(payment.dueDate)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        {formatCurrency(payment.amount)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">
                        {formatCurrency(payment.paidAmount)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatDateOnly(payment.paidDate)}</Typography>
                    </TableCell>
                    <TableCell>
                      <PaymentStatusChip status={payment.status} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {payment.notes ?? '—'}
                      </Typography>
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
    </Box>
  );
}
