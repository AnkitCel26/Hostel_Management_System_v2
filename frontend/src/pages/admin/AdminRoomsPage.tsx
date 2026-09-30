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
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import SearchIcon from '@mui/icons-material/Search';
import InputAdornment from '@mui/material/InputAdornment';

import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { OccupancyChip } from '../../components/OccupancyChip';
import { PageHeader } from '../../components/PageHeader';
import { RoomFormDialog } from '../../components/admin/RoomFormDialog';
import { useSnackbar } from '../../context/SnackbarContext';
import { GET_ALL_PGS_QUERY, GET_ALL_ROOMS_QUERY } from '../../graphql/operations';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { Pg, Room, RoomPage } from '../../types';
import { formatCurrency } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetAllRoomsData {
  getAllRooms: RoomPage;
}

interface GetAllPgsData {
  getAllPgs: Pg[];
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

export function AdminRoomsPage() {
  const [searchParams] = useSearchParams();
  const { success } = useSnackbar();

  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [pgFilter, setPgFilter] = React.useState(() => searchParams.get('pgId') ?? '');
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const [dialog, setDialog] = React.useState<{ open: boolean; room: Room | null }>({
    open: false,
    room: null
  });

  // Filters returning to their default values restart pagination.
  React.useEffect(() => {
    setPage(0);
  }, [debouncedSearch, pgFilter]);

  const trimmedSearch = debouncedSearch.trim();
  const { data, previousData, loading, error, refetch } = useQuery<GetAllRoomsData>(
    GET_ALL_ROOMS_QUERY,
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
  const pgsQuery = useQuery<GetAllPgsData>(GET_ALL_PGS_QUERY);

  // Keep the previous page visible while a refetch is in flight (no flicker).
  const roomPage = data?.getAllRooms ?? previousData?.getAllRooms ?? null;
  const rooms = roomPage?.items ?? [];
  const total = roomPage?.total ?? 0;
  const pgs = pgsQuery.data?.getAllPgs ?? [];
  const hasActiveFilters = trimmedSearch !== '' || pgFilter !== '';

  const openCreate = () => setDialog({ open: true, room: null });
  const openEdit = (room: Room) => setDialog({ open: true, room });
  const closeDialog = () => setDialog({ open: false, room: null });

  const handleSaved = (message: string): void => {
    closeDialog();
    success(message);
    void refetch();
  };

  return (
    <Box>
      <PageHeader
        title="Room Management"
        subtitle="Search rooms, track occupancy, and keep capacity and rent up to date."
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add Room
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
            label="Search rooms"
            placeholder="Room number or type"
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
            inputProps={{ 'aria-label': 'Search rooms by number or type' }}
            sx={{ flexGrow: 1 }}
          />
          <TextField
            select
            label={PROPERTY_TERM.singular}
            size="small"
            value={pgFilter}
            onChange={(event) => setPgFilter(event.target.value)}
            sx={{ minWidth: { sm: 200 } }}
            inputProps={{ 'aria-label': `Filter rooms by ${PROPERTY_TERM.singularLower}` }}
          >
            <MenuItem value="">All {PROPERTY_TERM.pluralLower}</MenuItem>
            {pgs.map((pg) => (
              <MenuItem key={pg.id} value={pg.id}>
                {pg.name}
              </MenuItem>
            ))}
          </TextField>
          {roomPage ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap' }}
            >
              {rooms.length} of {total} room{total === 1 ? '' : 's'}
            </Typography>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert title="Unable to load rooms" message={error.message} />
          <Button variant="outlined" onClick={() => void refetch()}>
            Retry
          </Button>
        </Stack>
      ) : !roomPage && loading ? (
        <LoadingIndicator label="Loading rooms…" />
      ) : rooms.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MeetingRoomIcon fontSize="large" />}
            title={hasActiveFilters ? 'No rooms match your search' : 'No rooms yet'}
            message={
              hasActiveFilters
                ? `Try a different search term or clear the ${PROPERTY_TERM.singularLower} filter.`
                : 'Add your first room to start managing occupancy.'
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
                  Add Room
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card sx={{ position: 'relative', overflow: 'hidden' }}>
          {loading ? (
            <LinearProgress
              aria-label="Refreshing rooms"
              sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}
            />
          ) : null}
          <TableContainer>
            <Table aria-label="Rooms">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>Room</TableCell>
                  <TableCell sx={headCellSx}>{PROPERTY_TERM.singular}</TableCell>
                  <TableCell sx={headCellSx}>Type</TableCell>
                  <TableCell sx={headCellSx} align="right">
                    Rent
                  </TableCell>
                  <TableCell sx={headCellSx}>Occupancy</TableCell>
                  <TableCell sx={headCellSx} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rooms.map((room) => (
                  <TableRow key={room.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {room.roomNumber}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {room.floor !== null ? `Floor ${room.floor}` : 'Floor not set'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{room.pg?.name ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{room.roomType ?? '—'}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        {formatCurrency(room.rent)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        per month
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <OccupancyChip occupied={room.occupiedCount} capacity={room.capacity} />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={`Edit room ${room.roomNumber}`}>
                        <IconButton
                          aria-label={`Edit room ${room.roomNumber}`}
                          size="small"
                          onClick={() => openEdit(room)}
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

      <RoomFormDialog
        open={dialog.open}
        room={dialog.room}
        pgs={pgs}
        onClose={closeDialog}
        onSaved={handleSaved}
      />
    </Box>
  );
}
