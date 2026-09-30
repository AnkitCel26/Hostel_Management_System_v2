import { useQuery } from '@apollo/client';
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  LinearProgress,
  Stack,
  Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import PeopleIcon from '@mui/icons-material/People';
import PhoneIcon from '@mui/icons-material/Phone';
import StairsIcon from '@mui/icons-material/Stairs';

import { DetailItem, DetailLabel } from '../../components/DetailItem';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { OccupancyChip } from '../../components/OccupancyChip';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { GET_TENANT_PG_ROOM_QUERY } from '../../graphql/operations';
import type { Room, TenantPgRoom } from '../../types';
import { formatCurrency } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetTenantPgRoomData {
  getTenantPgRoom: TenantPgRoom | null;
}

/** Tinted icon badge — same treatment as the property cards and stat tiles. */
const iconBadgeSx = {
  width: 44,
  height: 44,
  borderRadius: 2.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: 'primary.main',
  bgcolor: (theme: { palette: { primary: { main: string } } }) =>
    alpha(theme.palette.primary.main, 0.1)
} as const;

/** Same occupancy tone scale as the property cards (FR-11). */
function occupancyTone(percent: number): 'primary' | 'warning' | 'error' {
  if (percent >= 100) return 'error';
  if (percent >= 75) return 'warning';
  return 'primary';
}

/** Occupancy stat tone — same thresholds as the Property Management summary. */
function occupancyStatTone(percent: number): 'success' | 'warning' | 'error' {
  if (percent >= 100) return 'error';
  if (percent >= 75) return 'warning';
  return 'success';
}

/** Friendly occupancy note derived from the room's live bed counts. */
function sharingNote(room: Room): string {
  if (room.occupiedCount >= room.capacity) {
    return 'This room is currently at full capacity.';
  }
  const others = room.occupiedCount - 1;
  if (others > 0) {
    return `You share this room with ${others} other tenant${others === 1 ? '' : 's'}.`;
  }
  return 'You have this room to yourself.';
}

/**
 * Tenant My Room page (/tenant/room): shows the tenant's assigned PG and room
 * (FR-17). "Not assigned yet" is a valid empty state while the admin has not
 * created the tenant's assignment.
 */
export function TenantRoomPage() {
  const { data, loading, error, refetch } = useQuery<GetTenantPgRoomData>(GET_TENANT_PG_ROOM_QUERY);

  const assignment = data?.getTenantPgRoom ?? null;

  if (loading) {
    return <LoadingIndicator label="Loading your room…" />;
  }

  if (error) {
    return (
      <Stack spacing={2} alignItems="flex-start">
        <ErrorAlert title="Unable to load your room" message={error.message} />
        <Button variant="outlined" onClick={() => void refetch()}>
          Retry
        </Button>
      </Stack>
    );
  }

  if (!assignment) {
    return (
      <Card>
        <EmptyState
          icon={<MeetingRoomIcon fontSize="large" />}
          title="No room assigned yet"
          message={`Your administrator has not assigned you to a ${PROPERTY_TERM.singularLower} and room yet. Please check back later or contact your administrator.`}
        />
      </Card>
    );
  }

  const { pg, room } = assignment;
  const occupancyPercent =
    room && room.capacity > 0 ? Math.round((room.occupiedCount / room.capacity) * 100) : 0;

  return (
    <Box>
      <PageHeader
        title="My Room"
        subtitle={`Your current ${PROPERTY_TERM.singularLower} and room assignment.`}
      />

      {/* Summary row — same stat tiles as the management pages */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: room
            ? { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }
            : { xs: '1fr', sm: '1fr 1fr' },
          gap: { xs: 2, md: 3 },
          mb: 3
        }}
      >
        {room ? (
          <>
            <StatCard
              icon={<CurrencyRupeeIcon />}
              label="Monthly Rent"
              value={formatCurrency(room.rent)}
              sublabel="per month"
            />
            <StatCard
              icon={<MeetingRoomIcon />}
              label="Room Type"
              value={room.roomType ?? 'Not set'}
              tone="secondary"
            />
            <StatCard
              icon={<StairsIcon />}
              label="Floor"
              value={room.floor !== null ? String(room.floor) : 'Not set'}
              tone="warning"
            />
            <StatCard
              icon={<PeopleIcon />}
              label="Occupancy"
              value={`${occupancyPercent}%`}
              sublabel={`${room.occupiedCount} of ${room.capacity} beds`}
              tone={occupancyStatTone(occupancyPercent)}
            />
          </>
        ) : (
          <>
            <StatCard
              icon={<ApartmentIcon />}
              label={PROPERTY_TERM.singular}
              value={pg.name}
              sublabel={pg.city ?? undefined}
            />
            <StatCard
              icon={<MeetingRoomIcon />}
              label="Room"
              value="Not assigned"
              sublabel="Contact your administrator"
              tone="secondary"
            />
          </>
        )}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 3,
          alignItems: 'stretch'
        }}
      >
        {/* Room card — the focus of this page */}
        <Card sx={{ height: '100%' }}>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
              <Box sx={iconBadgeSx}>
                <MeetingRoomIcon />
              </Box>
              <Typography variant="h6" component="h2">
                Room details
              </Typography>
            </Stack>

            {room ? (
              <>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Typography variant="h5" component="p" fontWeight={700}>
                    Room {room.roomNumber}
                  </Typography>
                  <OccupancyChip occupied={room.occupiedCount} capacity={room.capacity} />
                </Stack>

                {/* Occupancy summary — same pattern as the property cards */}
                <Box sx={{ mt: 2.5 }}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="baseline"
                    sx={{ mb: 0.75 }}
                  >
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      OCCUPANCY
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {room.occupiedCount} of {room.capacity} beds · {occupancyPercent}%
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(occupancyPercent, 100)}
                    color={occupancyTone(occupancyPercent)}
                    aria-label={`Room occupancy ${occupancyPercent} percent`}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08)
                    }}
                  />
                </Box>

                <Divider sx={{ my: 2.5 }} />

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 2
                  }}
                >
                  <DetailItem label="Type" value={room.roomType ?? 'Not set'} />
                  <DetailItem
                    label="Floor"
                    value={room.floor !== null ? String(room.floor) : 'Not set'}
                  />
                  <DetailItem
                    label="Capacity"
                    value={`${room.capacity} bed${room.capacity === 1 ? '' : 's'}`}
                  />
                  <DetailItem
                    label="Monthly rent"
                    value={`${formatCurrency(room.rent)} / month`}
                  />
                </Box>

                <Stack
                  direction="row"
                  spacing={1.25}
                  alignItems="center"
                  sx={{
                    mt: 2.5,
                    px: 1.5,
                    py: 1.25,
                    borderRadius: 2,
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06)
                  }}
                >
                  <PeopleIcon fontSize="small" color="primary" />
                  <Typography variant="body2" color="text.secondary">
                    {sharingNote(room)}
                  </Typography>
                </Stack>
              </>
            ) : (
              <Stack spacing={1.5} alignItems="center" sx={{ py: 4, textAlign: 'center' }}>
                <Box
                  sx={{
                    ...iconBadgeSx,
                    width: 48,
                    height: 48,
                    color: 'text.secondary',
                    bgcolor: 'action.hover'
                  }}
                >
                  <MeetingRoomIcon />
                </Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  No room assigned yet
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  You are assigned to {pg.name}, but a room has not been assigned yet. Please
                  contact your administrator.
                </Typography>
              </Stack>
            )}
          </CardContent>
        </Card>

        {/* Property card */}
        <Card sx={{ height: '100%' }}>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
              <Box sx={iconBadgeSx}>
                <ApartmentIcon />
              </Box>
              <Typography variant="h6" component="h2">
                {PROPERTY_TERM.singular} details
              </Typography>
            </Stack>

            <Typography variant="h5" component="p" fontWeight={700}>
              {pg.name}
            </Typography>
            {pg.city ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {pg.city}
              </Typography>
            ) : null}

            <Divider sx={{ my: 2.5 }} />

            <Stack spacing={2}>
              <Stack direction="row" spacing={1.25} alignItems="flex-start">
                <LocationOnIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
                <Box sx={{ minWidth: 0 }}>
                  <DetailLabel>Address</DetailLabel>
                  <Typography variant="body2" fontWeight={600}>
                    {pg.address}
                    {pg.city ? `, ${pg.city}` : ''}
                  </Typography>
                </Box>
              </Stack>
              {pg.contactNumber ? (
                <Stack direction="row" spacing={1.25} alignItems="flex-start">
                  <PhoneIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <DetailLabel>Contact</DetailLabel>
                    <Typography variant="body2" fontWeight={600}>
                      {pg.contactNumber}
                    </Typography>
                  </Box>
                </Stack>
              ) : null}
              {pg.description ? (
                <Box sx={{ minWidth: 0 }}>
                  <DetailLabel>About this {PROPERTY_TERM.singularLower}</DetailLabel>
                  <Typography variant="body2" color="text.secondary">
                    {pg.description}
                  </Typography>
                </Box>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
