import React from 'react';
import { useQuery } from '@apollo/client';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  LinearProgress,
  Stack,
  TablePagination,
  Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import ApartmentIcon from '@mui/icons-material/Apartment';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';

import { ComplaintFormDialog } from '../../components/ComplaintFormDialog';
import { ComplaintStatusChip } from '../../components/ComplaintStatusChip';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { PageHeader } from '../../components/PageHeader';
import { useSnackbar } from '../../context/SnackbarContext';
import {
  GET_TENANT_COMPLAINTS_QUERY,
  GET_TENANT_PG_ROOM_QUERY
} from '../../graphql/operations';
import type { ComplaintPage, TenantPgRoom } from '../../types';
import { formatDate } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetTenantComplaintsData {
  getTenantComplaints: ComplaintPage;
}

interface GetTenantPgRoomData {
  getTenantPgRoom: TenantPgRoom | null;
}

const iconBadgeSx = {
  width: 40,
  height: 40,
  borderRadius: 2.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: 'primary.main',
  bgcolor: (theme: { palette: { primary: { main: string } } }) =>
    alpha(theme.palette.primary.main, 0.1)
} as const;

const STATUS_HINT: Record<string, string> = {
  open: 'Sent to the property team — they have seen it.',
  in_progress: 'The property team is working on it.',
  resolved: 'Marked as fixed by the property team.'
};

export function TenantComplaintsPage() {
  const { success } = useSnackbar();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);

  // The assignment decides whether a complaint can be filed at all: the server
  // requires a tenant record (and its PG) before it accepts a complaint.
  const assignmentQuery = useQuery<GetTenantPgRoomData>(GET_TENANT_PG_ROOM_QUERY);
  const assignment = assignmentQuery.data?.getTenantPgRoom ?? null;
  const canReport = assignment !== null && !assignmentQuery.loading;

  const { data, previousData, loading, error, refetch } = useQuery<GetTenantComplaintsData>(
    GET_TENANT_COMPLAINTS_QUERY,
    {
      variables: { limit: rowsPerPage, offset: page * rowsPerPage },
      notifyOnNetworkStatusChange: true
    }
  );

  const complaintPage = data?.getTenantComplaints ?? previousData?.getTenantComplaints ?? null;
  const complaints = complaintPage?.items ?? [];
  const total = complaintPage?.total ?? 0;

  const closeDialog = (): void => setDialogOpen(false);
  const handleSaved = (message: string): void => {
    closeDialog();
    success(message);
    setPage(0);
    void refetch();
  };

  return (
    <Box>
      <PageHeader
        title="My Complaints"
        subtitle={
          assignment
            ? `Report a problem at ${assignment.pg.name} and follow it until it is resolved.`
            : `Report a problem and follow it until it is resolved.`
        }
        action={
          canReport ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialogOpen(true)}
            >
              Report Complaint
            </Button>
          ) : undefined
        }
      />

      {!assignmentQuery.loading && !assignment ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          You need to be assigned to a {PROPERTY_TERM.singularLower} before you can report a
          complaint. Your administrator can set this up from Tenant Management.
        </Alert>
      ) : null}

      {error ? (
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert title="Unable to load your complaints" message={error.message} />
          <Button variant="outlined" onClick={() => void refetch()}>
            Retry
          </Button>
        </Stack>
      ) : !complaintPage && loading ? (
        <LoadingIndicator label="Loading your complaints…" />
      ) : complaints.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ReportProblemIcon fontSize="large" />}
            title="No complaints yet"
            message={
              canReport
                ? 'Something wrong in your room or the common area? Report it here and the property team will pick it up.'
                : 'Once you are assigned to a property, you can report any problem with your room or the common areas.'
            }
            action={
              canReport ? (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setDialogOpen(true)}
                >
                  Report Complaint
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card sx={{ position: 'relative', overflow: 'hidden' }}>
          {loading ? (
            <LinearProgress
              aria-label="Refreshing your complaints"
              sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}
            />
          ) : null}
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <Stack divider={<Divider flexItem />}>
              {complaints.map((complaint) => (
                <Box key={complaint.id} sx={{ p: { xs: 2, sm: 3 } }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    alignItems={{ sm: 'center' }}
                    justifyContent="space-between"
                    sx={{ mb: 1 }}
                  >
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                      <Box sx={iconBadgeSx}>
                        {complaint.status === 'resolved' ? (
                          <EventAvailableIcon fontSize="small" />
                        ) : (
                          <ReportProblemIcon fontSize="small" />
                        )}
                      </Box>
                      <Typography variant="subtitle1" fontWeight={600} sx={{ minWidth: 0 }}>
                        {complaint.title}
                      </Typography>
                    </Stack>
                    <ComplaintStatusChip status={complaint.status} />
                  </Stack>

                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                    {complaint.description}
                  </Typography>

                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={{ xs: 0.5, sm: 2 }}
                    sx={{ mt: 1.5 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Filed {formatDate(complaint.createdAt)}
                    </Typography>
                    {complaint.resolvedAt ? (
                      <Typography variant="caption" color="text.secondary">
                        Resolved {formatDate(complaint.resolvedAt)}
                      </Typography>
                    ) : null}
                    {complaint.pg?.name ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <ApartmentIcon sx={{ fontSize: 14 }} color="action" />
                        <Typography variant="caption" color="text.secondary">
                          {complaint.pg.name}
                        </Typography>
                      </Stack>
                    ) : null}
                  </Stack>

                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                    {STATUS_HINT[complaint.status] ??
                      'The property team keeps this status up to date.'}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
          {total > rowsPerPage ? (
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
              rowsPerPageOptions={[5, 10, 20]}
              sx={{ borderTop: 1, borderColor: 'divider' }}
            />
          ) : null}
        </Card>
      )}

      <ComplaintFormDialog
        open={dialogOpen}
        mode="create"
        propertyName={assignment?.pg.name}
        onClose={closeDialog}
        onSaved={handleSaved}
      />
    </Box>
  );
}
