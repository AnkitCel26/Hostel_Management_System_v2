import React from 'react';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  Skeleton,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
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
import { OccupancyChip } from '../../components/OccupancyChip';
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

/** Rooms rendered inside a property card; the rest collapse into a "more" link. */
const MAX_VISIBLE_ROOMS = 6;

const cardHoverSx: SxProps<Theme> = {
  transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    borderColor: (theme) => alpha(theme.palette.primary.main, 0.4),
    boxShadow: '0 10px 28px rgba(16, 24, 40, 0.09)'
  }
};

const actionIconSx: SxProps<Theme> = {
  border: 1,
  borderColor: 'divider',
  borderRadius: 2,
  bgcolor: 'background.paper',
  flexShrink: 0,
  transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
  '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main', color: 'primary.main' }
};

const heroSx: SxProps<Theme> = {
  mb: 3,
  color: 'common.white',
  border: 0,
  position: 'relative',
  overflow: 'hidden',
  background: (theme) =>
    `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
  boxShadow: '0 12px 32px rgba(25, 118, 210, 0.22)'
};

const heroContentSx: SxProps<Theme> = {
  p: { xs: 3, md: 4 },
  position: 'relative',
  '&:last-child': { pb: { xs: 3, md: 4 } }
};

const visuallyHiddenSx: SxProps<Theme> = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap'
};

function occupancyTone(percent: number): 'primary' | 'warning' | 'error' {
  if (percent >= 100) return 'error';
  if (percent >= 75) return 'warning';
  return 'primary';
}

function Overline({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="caption"
      display="block"
      sx={{
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'text.secondary',
        lineHeight: 1.6
      }}
    >
      {children}
    </Typography>
  );
}

function MetaItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ minWidth: 0 }}>
      <Box
        sx={{
          display: 'flex',
          mt: '2px',
          color: 'text.secondary',
          '& .MuiSvgIcon-root': { fontSize: 16 }
        }}
      >
        {icon}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>
        {children}
      </Typography>
    </Stack>
  );
}

interface PortfolioHeroProps {
  propertyCount: number;
  occupancyPercent: number;
  totalOccupied: number;
  totalBeds: number;
  onCreate: () => void;
}

function PortfolioHero({
  propertyCount,
  occupancyPercent,
  totalOccupied,
  totalBeds,
  onCreate
}: PortfolioHeroProps) {
  return (
    <Card sx={heroSx}>
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120% 130% at 100% 0%, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0) 55%)'
        }}
      />
      <CardContent sx={heroContentSx}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 3, md: 4 }}
          alignItems={{ md: 'center' }}
          justifyContent="space-between"
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="overline"
              component="p"
              sx={{ color: 'rgba(255, 255, 255, 0.85)', fontWeight: 600, letterSpacing: 1.4 }}
            >
              Portfolio overview
            </Typography>
            <Typography variant="h4" component="h1" sx={{ color: 'inherit', mt: 0.5 }}>
              {PROPERTY_TERM.singular} Management
            </Typography>
            <Typography sx={{ mt: 1.25, opacity: 0.9, maxWidth: 520 }}>
              Create and maintain your {PROPERTY_TERM.pluralLower}, and track room occupancy in
              each.
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onCreate}
              sx={{
                mt: 3,
                bgcolor: 'common.white',
                color: 'primary.main',
                '&:hover': { bgcolor: 'grey.100' }
              }}
            >
              Add {PROPERTY_TERM.singular}
            </Button>
          </Box>

          <Stack
            direction="row"
            spacing={3}
            alignItems="center"
            sx={{ display: { xs: 'none', sm: 'flex' }, flexShrink: 0 }}
          >
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <CircularProgress
                variant="determinate"
                value={100}
                size={132}
                thickness={4}
                aria-hidden="true"
                sx={{ color: 'rgba(255, 255, 255, 0.25)' }}
              />
              <CircularProgress
                variant="determinate"
                value={Math.min(occupancyPercent, 100)}
                size={132}
                thickness={4}
                aria-label={`Portfolio occupancy ${occupancyPercent} percent`}
                sx={{
                  position: 'absolute',
                  left: 0,
                  color: 'common.white',
                  '& .MuiCircularProgress-circle': { strokeLinecap: 'round' }
                }}
              />
              <Stack
                sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
                alignItems="center"
                justifyContent="center"
              >
                <Typography variant="h4" component="p" sx={{ color: 'inherit', lineHeight: 1.1 }}>
                  {occupancyPercent}%
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.85 }}>
                  occupied
                </Typography>
              </Stack>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                {PROPERTY_TERM.plural}
              </Typography>
              <Typography variant="h5" component="p" sx={{ color: 'inherit', lineHeight: 1.3 }}>
                {propertyCount}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.85, display: 'block', mt: 0.5 }}>
                {totalOccupied} of {totalBeds} beds filled
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

interface RoomTileProps {
  room: Room;
}

function RoomTile({ room }: RoomTileProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        flexWrap: 'wrap',
        px: 1.5,
        py: 1.25,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2.5,
        transition: 'border-color 150ms ease, background-color 150ms ease',
        '&:hover': { borderColor: (theme) => alpha(theme.palette.primary.main, 0.4) }
      }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 96 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {room.roomNumber}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {room.roomType ? `${room.roomType} · ` : ''}
          {formatCurrency(room.rent)}/month
        </Typography>
      </Box>
      <OccupancyChip occupied={room.occupiedCount} capacity={room.capacity} />
    </Box>
  );
}

interface PropertyCardProps {
  pg: Pg;
  onEdit: (pg: Pg) => void;
}

function PropertyCard({ pg, onEdit }: PropertyCardProps) {
  const rooms: Room[] = pg.rooms ?? [];
  const totalCapacity = rooms.reduce((sum, room) => sum + room.capacity, 0);
  const totalOccupied = rooms.reduce((sum, room) => sum + room.occupiedCount, 0);
  const occupancyPercent =
    totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;
  const vacantBeds = Math.max(totalCapacity - totalOccupied, 0);
  const visibleRooms = rooms.slice(0, MAX_VISIBLE_ROOMS);
  const hiddenRoomCount = rooms.length - visibleRooms.length;
  const roomsHref = `/admin/rooms?pgId=${pg.id}`;
  const tone = occupancyTone(occupancyPercent);

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', ...cardHoverSx }}>
      <CardContent
        sx={{ p: 2.5, flexGrow: 1, display: 'flex', flexDirection: 'column', pb: 2.5 }}
      >
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
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
              <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary" noWrap>
                {pg.city ?? 'City not set'}
              </Typography>
            </Stack>
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

        {pg.description ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {pg.description}
          </Typography>
        ) : null}

        <Box
          sx={{
            mt: 2,
            p: 1.75,
            borderRadius: 2.5,
            bgcolor: 'background.default',
            display: 'grid',
            gap: 1
          }}
        >
          <MetaItem icon={<LocationOnIcon />}>
            {pg.address}
            {pg.city ? `, ${pg.city}` : ''}
          </MetaItem>
          {pg.contactNumber ? (
            <MetaItem icon={<PhoneIcon />}>{pg.contactNumber}</MetaItem>
          ) : null}
        </Box>

        <Box sx={{ mt: 2.5 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="baseline"
            sx={{ mb: 1 }}
          >
            <Overline>Occupancy</Overline>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: `${tone}.main` }}>
              {occupancyPercent}%
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(occupancyPercent, 100)}
            color={tone}
            aria-label={`${pg.name} occupancy ${occupancyPercent} percent`}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08)
            }}
          />
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {totalOccupied} of {totalCapacity} beds
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {vacantBeds} vacant
            </Typography>
          </Stack>
        </Box>

        <Divider sx={{ my: 2.5 }} />

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1.5 }}
        >
          <Overline>Rooms</Overline>
          <Typography variant="caption" color="text.secondary">
            {rooms.length} total
          </Typography>
        </Stack>
        {rooms.length === 0 ? (
          <Box
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: '1px dashed',
              borderColor: 'divider',
              textAlign: 'center'
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No rooms added yet — use Manage rooms to add some.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
              gap: 1
            }}
          >
            {visibleRooms.map((room) => (
              <RoomTile key={room.id} room={room} />
            ))}
          </Box>
        )}
        {hiddenRoomCount > 0 ? (
          <Button
            component={RouterLink}
            to={roomsHref}
            size="small"
            sx={{ alignSelf: 'flex-start', mt: 1.5, ml: -0.5, fontSize: '0.75rem' }}
          >
            +{hiddenRoomCount} more room{hiddenRoomCount === 1 ? '' : 's'}
          </Button>
        ) : null}
      </CardContent>

      <Divider />
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2.5, py: 1.25, mt: 'auto' }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {rooms.length} room{rooms.length === 1 ? '' : 's'}
          </Typography>
          <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'divider' }} />
          <Typography variant="caption" color="text.secondary">
            {totalCapacity} bed{totalCapacity === 1 ? '' : 's'}
          </Typography>
        </Stack>
        <Button
          component={RouterLink}
          to={roomsHref}
          size="small"
          endIcon={<ArrowForwardIcon sx={{ fontSize: 18 }} />}
        >
          Manage rooms
        </Button>
      </Stack>
    </Card>
  );
}

/** Skeleton that mirrors the page layout so nothing jumps when data arrives. */
function PageSkeleton() {
  return (
    <Box role="status" aria-busy="true" aria-label={`Loading ${PROPERTY_TERM.pluralLower}`}>
      <Box component="span" sx={visuallyHiddenSx}>
        {`Loading ${PROPERTY_TERM.pluralLower}…`}
      </Box>

      <Card sx={heroSx}>
        <CardContent sx={heroContentSx}>
          <Skeleton
            variant="text"
            width={140}
            sx={{ bgcolor: 'rgba(255, 255, 255, 0.3)' }}
            aria-hidden="true"
          />
          <Skeleton
            variant="text"
            width={280}
            height={44}
            sx={{ bgcolor: 'rgba(255, 255, 255, 0.3)' }}
            aria-hidden="true"
          />
          <Skeleton
            variant="text"
            width="100%"
            sx={{ bgcolor: 'rgba(255, 255, 255, 0.22)', mt: 1 }}
            aria-hidden="true"
          />
          <Skeleton
            variant="rounded"
            width={160}
            height={40}
            sx={{ bgcolor: 'rgba(255, 255, 255, 0.3)', mt: 2.5, borderRadius: 2 }}
            aria-hidden="true"
          />
        </CardContent>
      </Card>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: { xs: 2, md: 3 },
          mb: 3
        }}
      >
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} variant="rounded" height={90} aria-hidden="true" />
        ))}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
          gap: 3
        }}
      >
        {[0, 1].map((cardKey) => (
          <Card key={cardKey}>
            <CardContent sx={{ p: 2.5, display: 'grid', gap: 1.75 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Skeleton
                  variant="rounded"
                  width={44}
                  height={44}
                  sx={{ borderRadius: 2.5, flexShrink: 0 }}
                  aria-hidden="true"
                />
                <Box sx={{ flexGrow: 1, display: 'grid', gap: 0.5 }}>
                  <Skeleton width="55%" aria-hidden="true" />
                  <Skeleton width="35%" aria-hidden="true" />
                </Box>
              </Stack>
              <Skeleton variant="rounded" height={64} sx={{ borderRadius: 2.5 }} aria-hidden="true" />
              <Skeleton width="30%" aria-hidden="true" />
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                  gap: 1
                }}
              >
                {[0, 1, 2, 3].map((key) => (
                  <Skeleton key={key} variant="rounded" height={52} aria-hidden="true" />
                ))}
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

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

  if (error) {
    return (
      <Box>
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert
            title={`Unable to load ${PROPERTY_TERM.pluralLower}`}
            message={error.message}
          />
          <Button variant="outlined" onClick={() => void refetch()}>
            Retry
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box>
      {loading && data === undefined ? (
        <PageSkeleton />
      ) : (
        <>
          <PortfolioHero
            propertyCount={pgs.length}
            occupancyPercent={occupancyPercent}
            totalOccupied={totalOccupied}
            totalBeds={totalBeds}
            onCreate={openCreate}
          />

          {pgs.length === 0 ? (
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
                  mb: 3.5
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

              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 2 }}
              >
                <Overline>Your {PROPERTY_TERM.pluralLower}</Overline>
                <Typography variant="caption" color="text.secondary">
                  {pgs.length} total
                </Typography>
              </Stack>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                  gap: 3,
                  alignItems: 'stretch'
                }}
              >
                {pgs.map((pg) => (
                  <PropertyCard key={pg.id} pg={pg} onEdit={openEdit} />
                ))}
              </Box>
            </>
          )}
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
