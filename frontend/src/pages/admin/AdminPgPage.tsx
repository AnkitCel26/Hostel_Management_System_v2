import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import ApartmentIcon from '@mui/icons-material/Apartment';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import BedIcon from '@mui/icons-material/Bed';
import EditIcon from '@mui/icons-material/Edit';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import PeopleIcon from '@mui/icons-material/People';
import PhoneIcon from '@mui/icons-material/Phone';

import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { OccupancyChip } from '../../components/OccupancyChip';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { PgFormDialog } from '../../components/admin/PgFormDialog';
import { useSnackbar } from '../../context/SnackbarContext';
import { GET_ALL_PGS_ROOMS_QUERY } from '../../graphql/operations';
import type { Pg, Room } from '../../types';
import { formatCurrency } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetAllPgsRoomsData {
  getAllPgsRooms: Pg[];
}

/** Bordered icon button — same treatment as the profile page actions. */
const actionIconSx = {
  border: 1,
  borderColor: 'divider',
  borderRadius: 2,
  bgcolor: 'background.paper',
  flexShrink: 0
} as const;

function occupancyTone(percent: number): 'primary' | 'warning' | 'error' {
  if (percent >= 100) return 'error';
  if (percent >= 75) return 'warning';
  return 'primary';
}

interface PgCardProps {
  pg: Pg;
  onEdit: (pg: Pg) => void;
}

/** One PG card: identity, occupancy summary, and a compact room list (FR-08, FR-11). */
function PgCard({ pg, onEdit }: PgCardProps) {
  const rooms: Room[] = pg.rooms ?? [];
  const totalCapacity = rooms.reduce((sum, room) => sum + room.capacity, 0);
  const totalOccupied = rooms.reduce((sum, room) => sum + room.occupiedCount, 0);
  const occupancyPercent =
    totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Identity */}
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: 'primary.main',
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1)
            }}
          >
            <ApartmentIcon />
          </Box>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" component="h2" noWrap>
              {pg.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {pg.city ?? 'City not set'}
            </Typography>
          </Box>
          <Tooltip title={`Edit ${pg.name}`}>
            <IconButton
              aria-label={`Edit ${pg.name}`}
              size="small"
              onClick={() => onEdit(pg)}
              sx={actionIconSx}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Contact meta */}
        <Stack spacing={0.75} sx={{ mt: 2 }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <LocationOnIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
            <Typography variant="body2" color="text.secondary">
              {pg.address}
              {pg.city ? `, ${pg.city}` : ''}
            </Typography>
          </Stack>
          {pg.contactNumber ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <PhoneIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {pg.contactNumber}
              </Typography>
            </Stack>
          ) : null}
        </Stack>

        {/* Occupancy summary */}
        <Box sx={{ mt: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              OCCUPANCY
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {totalOccupied} of {totalCapacity} beds · {occupancyPercent}%
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(occupancyPercent, 100)}
            color={occupancyTone(occupancyPercent)}
            aria-label={`${pg.name} occupancy ${occupancyPercent} percent`}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08)
            }}
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Rooms */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
          <Typography variant="subtitle2" component="h3">
            Rooms
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {rooms.length} total
          </Typography>
        </Stack>
        {rooms.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No rooms added yet — use Manage rooms to add some.
          </Typography>
        ) : (
          <Stack
            spacing={1}
            sx={{
              flexGrow: 1,
              maxHeight: 196,
              overflowY: 'auto',
              pr: 0.5
            }}
          >
            {rooms.map((room) => (
              <Box
                key={room.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 1.5,
                  py: 1.25,
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'divider'
                }}
              >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {room.roomNumber}
                    {room.roomType ? (
                      <Typography component="span" variant="body2" color="text.secondary">
                        {' '}
                        · {room.roomType}
                      </Typography>
                    ) : null}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {formatCurrency(room.rent)}/month
                    {room.floor !== null ? ` · Floor ${room.floor}` : ''}
                  </Typography>
                </Box>
                <OccupancyChip occupied={room.occupiedCount} capacity={room.capacity} />
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>

      {/* Footer */}
      <Divider />
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 3, py: 1.5 }}
      >
        <Typography variant="caption" color="text.secondary">
          {rooms.length} room{rooms.length === 1 ? '' : 's'} · {totalCapacity} bed
          {totalCapacity === 1 ? '' : 's'}
        </Typography>
        <Button
          component={RouterLink}
          to={`/admin/rooms?pgId=${pg.id}`}
          size="small"
          endIcon={<ArrowForwardIcon />}
        >
          Manage rooms
        </Button>
      </Stack>
    </Card>
  );
}

/**
 * Admin Property Management page (/admin/properties): a summary row plus one
 * card per property with its rooms and occupancy; create/update via the form
 * dialog (FR-06, FR-07, FR-08, FR-11). The domain entity is `Pg` (MRD); the
 * user-facing term is "Property" (see utils/labels).
 */
export function AdminPgPage() {
  const { data, loading, error, refetch } = useQuery<GetAllPgsRoomsData>(GET_ALL_PGS_ROOMS_QUERY);
  const { success } = useSnackbar();

  const [dialog, setDialog] = React.useState<{ open: boolean; pg: Pg | null }>({
    open: false,
    pg: null
  });

  const pgs = data?.getAllPgsRooms ?? [];
  const allRooms = pgs.flatMap((pg) => pg.rooms ?? []);
  const totalBeds = allRooms.reduce((sum, room) => sum + room.capacity, 0);
  const totalOccupied = allRooms.reduce((sum, room) => sum + room.occupiedCount, 0);
  const occupancyPercent = totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0;

  const openCreate = () => setDialog({ open: true, pg: null });
  const openEdit = (pg: Pg) => setDialog({ open: true, pg });
  const closeDialog = () => setDialog({ open: false, pg: null });

  const handleSaved = (message: string): void => {
    closeDialog();
    success(message);
    void refetch();
  };

  return (
    <Box>
      <PageHeader
        title={`${PROPERTY_TERM.singular} Management`}
        subtitle={`Create and maintain your ${PROPERTY_TERM.pluralLower}, and track room occupancy in each.`}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add {PROPERTY_TERM.singular}
          </Button>
        }
      />

      {loading ? (
        <LoadingIndicator label={`Loading ${PROPERTY_TERM.pluralLower}…`} />
      ) : error ? (
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert
            title={`Unable to load ${PROPERTY_TERM.pluralLower}`}
            message={error.message}
          />
          <Button variant="outlined" onClick={() => void refetch()}>
            Retry
          </Button>
        </Stack>
      ) : pgs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ApartmentIcon fontSize="large" />}
            title={`No ${PROPERTY_TERM.pluralLower} yet`}
            message={`Create your first ${PROPERTY_TERM.singularLower} to start adding rooms and managing occupancy.`}
            action={
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                Add {PROPERTY_TERM.singular}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
              gap: { xs: 2, md: 3 },
              mb: 3
            }}
          >
            <StatCard
              icon={<ApartmentIcon />}
              label={`Total ${PROPERTY_TERM.plural}`}
              value={String(pgs.length)}
            />
            <StatCard
              icon={<MeetingRoomIcon />}
              label="Total Rooms"
              value={String(allRooms.length)}
              tone="secondary"
            />
            <StatCard icon={<BedIcon />} label="Total Beds" value={String(totalBeds)} />
            <StatCard
              icon={<PeopleIcon />}
              label="Beds Occupied"
              value={`${occupancyPercent}%`}
              sublabel={`${totalOccupied} of ${totalBeds} beds`}
              tone={occupancyPercent >= 100 ? 'error' : occupancyPercent >= 75 ? 'warning' : 'success'}
            />
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
              gap: 3
            }}
          >
            {pgs.map((pg) => (
              <PgCard key={pg.id} pg={pg} onEdit={openEdit} />
            ))}
          </Box>
        </>
      )}

      <PgFormDialog
        open={dialog.open}
        pg={dialog.pg}
        onClose={closeDialog}
        onSaved={handleSaved}
      />
    </Box>
  );
}
