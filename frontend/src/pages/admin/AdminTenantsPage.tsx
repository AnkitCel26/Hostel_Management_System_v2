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
import EditIcon from '@mui/icons-material/Edit';
import PeopleIcon from '@mui/icons-material/People';
import SearchIcon from '@mui/icons-material/Search';
import InputAdornment from '@mui/material/InputAdornment';

import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { PageHeader } from '../../components/PageHeader';
import { TenantFormDialog } from '../../components/admin/TenantFormDialog';
import { useSnackbar } from '../../context/SnackbarContext';
import {
  GET_ALL_PGS_ROOMS_QUERY,
  GET_ALL_TENANTS_QUERY,
  GET_ALL_USERS_QUERY
} from '../../graphql/operations';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminUser, Pg, Tenant, TenantPage } from '../../types';
import { formatDate } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetAllTenantsData {
  getAllTenants: TenantPage;
}

interface GetAllPgsRoomsData {
  getAllPgsRooms: Pg[];
}

interface GetAllUsersData {
  allUsers: AdminUser[];
}

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

const actionIconSx = {
  border: 1,
  borderColor: 'divider',
  borderRadius: 2,
  bgcolor: 'background.paper'
} as const;

export function AdminTenantsPage() {
  const [searchParams] = useSearchParams();
  const { success } = useSnackbar();

  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [pgFilter, setPgFilter] = React.useState(() => searchParams.get('pgId') ?? '');
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const [dialog, setDialog] = React.useState<{ open: boolean; tenant: Tenant | null }>({
    open: false,
    tenant: null
  });

  React.useEffect(() => {
    setPage(0);
  }, [debouncedSearch, pgFilter]);

  const trimmedSearch = debouncedSearch.trim();
  const { data, previousData, loading, error, refetch } = useQuery<GetAllTenantsData>(
    GET_ALL_TENANTS_QUERY,
    {
      variables: {
        search: trimmedSearch === '' ? undefined : trimmedSearch,
        pgId: pgFilter === '' ? undefined : pgFilter,
        limit: rowsPerPage,
        offset: page * rowsPerPage
      },
      notifyOnNetworkStatusChange: true
    }
  );
  const pgsQuery = useQuery<GetAllPgsRoomsData>(GET_ALL_PGS_ROOMS_QUERY);
  const usersQuery = useQuery<GetAllUsersData>(GET_ALL_USERS_QUERY);

  const tenantPage = data?.getAllTenants ?? previousData?.getAllTenants ?? null;
  const tenants = tenantPage?.items ?? [];
  const total = tenantPage?.total ?? 0;
  const pgs = pgsQuery.data?.getAllPgsRooms ?? [];
  const users = usersQuery.data?.allUsers ?? [];
  const hasActiveFilters = trimmedSearch !== '' || pgFilter !== '';

  const openCreate = () => setDialog({ open: true, tenant: null });
  const openEdit = (tenant: Tenant) => setDialog({ open: true, tenant });
  const closeDialog = () => setDialog({ open: false, tenant: null });

  const handleSaved = (message: string): void => {
    closeDialog();
    success(message);
    void refetch();
  };

  return (
    <Box>
      <PageHeader
        title="Tenant Management"
        subtitle="Search tenants, manage their details, and assign or move rooms."
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add Tenant
          </Button>
        }
      />

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
            label="Search tenants"
            placeholder="Name, phone, or email"
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
            inputProps={{ 'aria-label': 'Search tenants by name, phone, or email' }}
            sx={{ flexGrow: 1 }}
          />
          <TextField
            select
            label={PROPERTY_TERM.singular}
            size="small"
            value={pgFilter}
            onChange={(event) => setPgFilter(event.target.value)}
            sx={{ minWidth: { sm: 200 } }}
            inputProps={{ 'aria-label': `Filter tenants by ${PROPERTY_TERM.singularLower}` }}
          >
            <MenuItem value="">All {PROPERTY_TERM.pluralLower}</MenuItem>
            {pgs.map((pg) => (
              <MenuItem key={pg.id} value={pg.id}>
                {pg.name}
              </MenuItem>
            ))}
          </TextField>
          {tenantPage ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap' }}
            >
              {tenants.length} of {total} tenant{total === 1 ? '' : 's'}
            </Typography>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert title="Unable to load tenants" message={error.message} />
          <Button variant="outlined" onClick={() => void refetch()}>
            Retry
          </Button>
        </Stack>
      ) : !tenantPage && loading ? (
        <LoadingIndicator label="Loading tenants…" />
      ) : tenants.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PeopleIcon fontSize="large" />}
            title={hasActiveFilters ? 'No tenants match your search' : 'No tenants yet'}
            message={
              hasActiveFilters
                ? `Try a different search term or clear the ${PROPERTY_TERM.singularLower} filter.`
                : 'Add your first tenant to start managing room assignments.'
            }
            action={
              hasActiveFilters ? (
                <Button
                  variant="outlined"
                  onClick={() => {
                    setSearchInput('');
                    setPgFilter('');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                  Add Tenant
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card sx={{ position: 'relative', overflow: 'hidden' }}>
          {loading ? (
            <LinearProgress
              aria-label="Refreshing tenants"
              sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}
            />
          ) : null}
          <TableContainer>
            <Table aria-label="Tenants">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>Tenant</TableCell>
                  <TableCell sx={headCellSx}>{PROPERTY_TERM.singular}</TableCell>
                  <TableCell sx={headCellSx}>Room</TableCell>
                  <TableCell sx={headCellSx}>Phone</TableCell>
                  <TableCell sx={headCellSx}>Joined</TableCell>
                  <TableCell sx={headCellSx} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {tenant.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {tenant.user?.email ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{tenant.pg?.name ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      {tenant.room ? (
                        <>
                          <Typography variant="body2" fontWeight={600}>
                            {tenant.room.roomNumber}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {tenant.room.occupiedCount} of {tenant.room.capacity} beds occupied
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Not assigned
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{tenant.phone ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {/* joinDate is date-only (YYYY-MM-DD); anchor it at local midnight so
                            the calendar day never shifts with the viewer's time zone. */}
                        {tenant.joinDate ? formatDate(`${tenant.joinDate}T00:00:00`) : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={`Edit tenant ${tenant.name}`}>
                        <IconButton
                          aria-label={`Edit tenant ${tenant.name}`}
                          size="small"
                          onClick={() => openEdit(tenant)}
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

      <TenantFormDialog
        open={dialog.open}
        tenant={dialog.tenant}
        pgs={pgs}
        users={users}
        onClose={closeDialog}
        onSaved={handleSaved}
      />
    </Box>
  );
}
