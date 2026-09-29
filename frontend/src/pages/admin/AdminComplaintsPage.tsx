import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import {
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  InputAdornment,
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
import EditIcon from '@mui/icons-material/Edit';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import SearchIcon from '@mui/icons-material/Search';

import { ComplaintFormDialog } from '../../components/ComplaintFormDialog';
import { ComplaintStatusChip } from '../../components/ComplaintStatusChip';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { PageHeader } from '../../components/PageHeader';
import { useSnackbar } from '../../context/SnackbarContext';
import {
  GET_ALL_COMPLAINTS_QUERY,
  GET_ALL_PGS_QUERY
} from '../../graphql/operations';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { Complaint, ComplaintPage, ComplaintStatus, Pg } from '../../types';
import { formatDate } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetAllComplaintsData {
  getAllComplaints: ComplaintPage;
}

interface GetAllPgsData {
  getAllPgs: Pg[];
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

/** Bordered icon button — same treatment as the rooms, tenants, and payments pages. */
const actionIconSx = {
  border: 1,
  borderColor: 'divider',
  borderRadius: 2,
  bgcolor: 'background.paper'
} as const;

/** Long descriptions collapse to two lines; the full text stays in the title attribute. */
const descriptionSx = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
} as const;

/**
 * Admin complaints page (/admin/complaints): the searchable, filterable list of
 * every tenant complaint with status management (FR-23 retrieval, FR-24
 * update). Complaints are filed by tenants, so this page has no create action.
 */
export function AdminComplaintsPage() {
  const [searchParams] = useSearchParams();
  const { success } = useSnackbar();

  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [pgFilter, setPgFilter] = React.useState(() => searchParams.get('pgId') ?? '');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Complaint | null>(null);

  // Filters returning to their default values restart pagination.
  React.useEffect(() => {
    setPage(0);
  }, [debouncedSearch, pgFilter, statusFilter]);

  const trimmedSearch = debouncedSearch.trim();
  const { data, previousData, loading, error, refetch } = useQuery<GetAllComplaintsData>(
    GET_ALL_COMPLAINTS_QUERY,
    {
      variables: {
        search: trimmedSearch === '' ? undefined : trimmedSearch,
        pgId: pgFilter === '' ? undefined : pgFilter,
        status: statusFilter === '' ? undefined : (statusFilter as ComplaintStatus),
        limit: rowsPerPage,
        offset: page * rowsPerPage
      },
      notifyOnNetworkStatusChange: true
    }
  );
  const pgsQuery = useQuery<GetAllPgsData>(GET_ALL_PGS_QUERY);

  // Keep the previous page visible while a refetch is in flight (no flicker).
  const complaintPage = data?.getAllComplaints ?? previousData?.getAllComplaints ?? null;
  const complaints = complaintPage?.items ?? [];
  const total = complaintPage?.total ?? 0;
  const pgs = pgsQuery.data?.getAllPgs ?? [];
  const hasActiveFilters = trimmedSearch !== '' || pgFilter !== '' || statusFilter !== '';

  const openUpdate = (complaint: Complaint): void => {
    setSelected(complaint);
    setDialogOpen(true);
  };
  const closeDialog = (): void => {
    setDialogOpen(false);
    setSelected(null);
  };

  const handleSaved = (message: string): void => {
    closeDialog();
    success(message);
    void refetch();
  };

  const clearFilters = (): void => {
    setSearchInput('');
    setPgFilter('');
    setStatusFilter('');
  };

  return (
    <Box>
      <PageHeader
        title="Complaints"
        subtitle="Review tenant complaints, track progress, and close resolved issues."
      />

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
            label="Search complaints"
            placeholder="Title, description, tenant, email, or room"
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
            inputProps={{
              'aria-label': 'Search complaints by title, description, tenant, email, or room'
            }}
            sx={{ flexGrow: 1 }}
          />
          <TextField
            select
            label={PROPERTY_TERM.singular}
            size="small"
            value={pgFilter}
            onChange={(event) => setPgFilter(event.target.value)}
            sx={{ minWidth: { sm: 180 } }}
            inputProps={{ 'aria-label': `Filter complaints by ${PROPERTY_TERM.singularLower}` }}
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
            inputProps={{ 'aria-label': 'Filter complaints by status' }}
          >
            <MenuItem value="">All statuses</MenuItem>
            <MenuItem value="open">Open</MenuItem>
            <MenuItem value="in_progress">In Progress</MenuItem>
            <MenuItem value="resolved">Resolved</MenuItem>
          </TextField>
          {complaintPage ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap' }}
            >
              {complaints.length} of {total} complaint{total === 1 ? '' : 's'}
            </Typography>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert title="Unable to load complaints" message={error.message} />
          <Button variant="outlined" onClick={() => void refetch()}>
            Retry
          </Button>
        </Stack>
      ) : !complaintPage && loading ? (
        <LoadingIndicator label="Loading complaints…" />
      ) : complaints.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ReportProblemIcon fontSize="large" />}
            title={
              hasActiveFilters ? 'No complaints match your filters' : 'No complaints yet'
            }
            message={
              hasActiveFilters
                ? 'Try a different search term or clear the filters.'
                : 'When a tenant reports a problem, it will appear here for you to review and resolve.'
            }
            action={
              hasActiveFilters ? (
                <Button variant="outlined" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card sx={{ position: 'relative', overflow: 'hidden' }}>
          {loading ? (
            <LinearProgress
              aria-label="Refreshing complaints"
              sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}
            />
          ) : null}
          <TableContainer>
            <Table aria-label="Tenant complaints">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>Tenant</TableCell>
                  <TableCell
                    sx={{ ...headCellSx, display: { xs: 'none', md: 'table-cell' } }}
                  >
                    {PROPERTY_TERM.singular}
                  </TableCell>
                  <TableCell sx={headCellSx}>Complaint</TableCell>
                  <TableCell sx={headCellSx}>Status</TableCell>
                  <TableCell sx={{ ...headCellSx, display: { xs: 'none', lg: 'table-cell' } }}>
                    Filed
                  </TableCell>
                  <TableCell sx={headCellSx} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {complaints.map((complaint) => (
                  <TableRow key={complaint.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {complaint.tenant?.name ?? '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {complaint.tenant?.user?.email ?? ''}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      <Typography variant="body2">
                        {complaint.pg?.name ?? complaint.tenant?.pg?.name ?? '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {complaint.tenant?.room
                          ? `Room ${complaint.tenant.room.roomNumber}`
                          : 'No room assigned'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 360 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {complaint.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        title={complaint.description}
                        sx={descriptionSx}
                      >
                        {complaint.description}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.5} alignItems="flex-start">
                        <ComplaintStatusChip status={complaint.status} />
                        {complaint.resolvedAt ? (
                          <Typography variant="caption" color="text.secondary">
                            Resolved {formatDate(complaint.resolvedAt)}
                          </Typography>
                        ) : null}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                      <Typography variant="body2">{formatDate(complaint.createdAt)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={`Update complaint from ${complaint.tenant?.name ?? 'tenant'}`}>
                        <IconButton
                          aria-label={`Update complaint from ${complaint.tenant?.name ?? 'tenant'}`}
                          size="small"
                          onClick={() => openUpdate(complaint)}
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

      <ComplaintFormDialog
        open={dialogOpen}
        mode="update"
        complaint={selected}
        onClose={closeDialog}
        onSaved={handleSaved}
      />
    </Box>
  );
}
