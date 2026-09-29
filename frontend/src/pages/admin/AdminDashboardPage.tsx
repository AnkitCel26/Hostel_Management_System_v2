import React from 'react';
import { useQuery } from '@apollo/client';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ApartmentIcon from '@mui/icons-material/Apartment';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CampaignIcon from '@mui/icons-material/Campaign';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import GroupIcon from '@mui/icons-material/Group';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import PendingIcon from '@mui/icons-material/Pending';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { ComplaintStatusChip } from '../../components/ComplaintStatusChip';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { PageHeader } from '../../components/PageHeader';
import { PaymentStatusChip } from '../../components/PaymentStatusChip';
import { StatCard } from '../../components/StatCard';
import { DashboardSection } from '../../components/dashboard/DashboardSection';
import { OccupancyChart } from '../../components/dashboard/OccupancyChart';
import { PaymentStatusChart } from '../../components/dashboard/PaymentStatusChart';
import { useAuth } from '../../context/AuthContext';
import {
  GET_ADMIN_DASHBOARD_STATS_QUERY,
  GET_ALL_PGS_QUERY
} from '../../graphql/operations';
import type { AdminDashboardStats, Pg } from '../../types';
import { getGraphQLErrorMessage } from '../../utils/errors';
import { formatCurrency, formatDateOnly } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetAdminDashboardData {
  getAdminDashboardStats: AdminDashboardStats;
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

interface QuickLink {
  to: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

/** Shortcut tiles that route to the module behind each headline number. */
const QUICK_LINKS: QuickLink[] = [
  {
    to: '/admin/properties',
    label: `${PROPERTY_TERM.plural}`,
    description: 'Add or edit a property and its contact details.',
    icon: <ApartmentIcon />
  },
  {
    to: '/admin/rooms',
    label: 'Rooms',
    description: 'Set up rooms, beds, and monthly rent.',
    icon: <MeetingRoomIcon />
  },
  {
    to: '/admin/tenants',
    label: 'Tenants',
    description: 'Onboard tenants and assign their room.',
    icon: <GroupIcon />
  },
  {
    to: '/admin/payments',
    label: 'Payments',
    description: 'Record rent and follow up on dues.',
    icon: <CurrencyRupeeIcon />
  },
  {
    to: '/admin/complaints',
    label: 'Complaints',
    description: 'Review and resolve tenant complaints.',
    icon: <ReportProblemIcon />
  },
  {
    to: '/admin/announcements',
    label: 'Announcements',
    description: 'Post an update for every tenant.',
    icon: <CampaignIcon />
  }
];

/**
 * A single "needs attention" line under the cards. Only shown when something
 * actually needs a decision, so a healthy operation stays quiet instead of
 * showing three zeroes as warnings.
 */
function AttentionBanner({ stats }: { stats: AdminDashboardStats }) {
  const notes: { tone: 'error' | 'warning' | 'info'; text: string }[] = [];

  if (stats.overdueCount > 0) {
    notes.push({
      tone: 'error',
      text: `${stats.overdueCount} payment${stats.overdueCount === 1 ? ' is' : 's are'} overdue — ${formatCurrency(stats.outstandingAmount)} outstanding.`
    });
  }
  if (stats.openComplaints > 0) {
    notes.push({
      tone: 'warning',
      text: `${stats.openComplaints} complaint${stats.openComplaints === 1 ? '' : 's'} still open.`
    });
  }
  if (stats.vacantRooms > 0 && stats.totalRooms > 0) {
    notes.push({
      tone: 'info',
      text: `${stats.vacantRooms} of ${stats.totalRooms} rooms ${stats.vacantRooms === 1 ? 'is' : 'are'} still vacant.`
    });
  }

  if (notes.length === 0) {
    return (
      <Card sx={{ mb: 3, bgcolor: 'background.paper' }}>
        <CardContent
          sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'center', gap: 1.5 }}
        >
          <CheckCircleIcon color="success" />
          <Typography variant="body2">
            Nothing needs attention right now. No overdue payments, no open complaints.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack spacing={1}>
          {notes.map((note) => (
            <Stack key={note.text} direction="row" spacing={1} alignItems="center">
              <Box
                aria-hidden
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  bgcolor: `${note.tone}.main`
                }}
              />
              <Typography variant="body2">{note.text}</Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

/** "View all" link in a panel header. */
function ViewAllLink({ to, label }: { to: string; label: string }) {
  return (
    <Button component={RouterLink} to={to} size="small" endIcon={<ArrowForwardIcon fontSize="small" />}>
      {label}
    </Button>
  );
}

/**
 * Admin dashboard (FR-31, MRD §10.9, design system §6).
 *
 * Layout, top to bottom: attention banner, six headline stat cards, the two
 * charts, recent activity tables, then shortcuts into each module. The numbers
 * all come from one `getAdminDashboardStats` query, so the cards, the charts,
 * and the tables can never show different numbers for the same thing.
 */
export function AdminDashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name.trim().split(' ')[0] ?? '';

  const { data, previousData, loading, error, refetch } =
    useQuery<GetAdminDashboardData>(GET_ADMIN_DASHBOARD_STATS_QUERY);

  // Only for the empty-state copy; the dashboard itself needs no property list.
  const pgsQuery = useQuery<GetAllPgsData>(GET_ALL_PGS_QUERY);
  const pgs = pgsQuery.data?.getAllPgs ?? [];

  // Keep the previous result visible while a refetch is in flight (no flicker).
  const stats =
    data?.getAdminDashboardStats ?? previousData?.getAdminDashboardStats ?? null;

  const chartEmptyState = (
    <EmptyState
      icon={<MeetingRoomIcon fontSize="large" />}
      title="Nothing to chart yet"
      message={
        pgs.length === 0
          ? `Add your first ${PROPERTY_TERM.singularLower}, then create rooms to see occupancy here.`
          : 'Add rooms with bed counts to see occupancy here.'
      }
      action={
        <Button
          component={RouterLink}
          to={pgs.length === 0 ? '/admin/properties' : '/admin/rooms'}
          variant="contained"
        >
          {pgs.length === 0 ? `Add ${PROPERTY_TERM.singularLower}` : 'Add rooms'}
        </Button>
      }
    />
  );

  if (error && stats === null) {
    return (
      <Box>
        <PageHeader title="Dashboard" subtitle="Operational overview of your properties." />
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert
            title="Unable to load the dashboard"
            message={getGraphQLErrorMessage(error)}
          />
          <Button variant="outlined" onClick={() => void refetch()}>
            Retry
          </Button>
        </Stack>
      </Box>
    );
  }

  if (stats === null) {
    return (
      <Box>
        <PageHeader title="Dashboard" subtitle="Operational overview of your properties." />
        <LoadingIndicator label="Loading dashboard…" />
      </Box>
    );
  }

  const recentPayments = stats.recentPayments.items;
  const recentComplaints = stats.recentComplaints.items;

  return (
    <Box>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Dashboard'}
        subtitle="Occupancy, collection, and open work across your properties."
        action={
          // A quiet refresh control: the dashboard is a read-only overview, so
          // re-running the query is the only action it needs.
          <Button variant="outlined" onClick={() => void refetch()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      {/* Thin progress strip while a background refresh is in flight, matching
          the management pages' pattern. */}
      {loading ? (
        <LinearProgress
          aria-label="Refreshing dashboard"
          sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: (theme) => theme.zIndex.appBar + 1 }}
        />
      ) : null}

      <AttentionBanner stats={stats} />

      {/* Headline numbers (design system §6 admin dashboard cards). */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', xl: 'repeat(6, 1fr)' },
          gap: { xs: 2, md: 2.5 },
          mb: 3
        }}
      >
        <StatCard
          icon={<ApartmentIcon />}
          label={PROPERTY_TERM.plural}
          value={String(stats.totalPgs)}
          tone="primary"
        />
        <StatCard
          icon={<MeetingRoomIcon />}
          label="Total rooms"
          value={String(stats.totalRooms)}
          sublabel={`${stats.occupiedRooms} occupied`}
          tone="primary"
        />
        <StatCard
          icon={<GroupIcon />}
          label="Total tenants"
          value={String(stats.totalTenants)}
          sublabel={`${stats.totalBeds} beds`}
          tone="secondary"
        />
        <StatCard
          icon={<PendingIcon />}
          label="Pending payments"
          value={String(stats.pendingCount + stats.partialCount)}
          sublabel={`${stats.partialCount} partial`}
          tone="warning"
        />
        <StatCard
          icon={<WarningAmberIcon />}
          label="Overdue"
          value={String(stats.overdueCount)}
          sublabel={`${formatCurrency(stats.outstandingAmount)} due`}
          tone="error"
        />
        <StatCard
          icon={<ReportProblemIcon />}
          label="Open complaints"
          value={String(stats.openComplaints)}
          sublabel={`${stats.inProgressComplaints} in progress`}
          tone="warning"
        />
      </Box>

      {/* Collection summary + charts. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
          gap: { xs: 2, md: 3 },
          mb: 3
        }}
      >
        <PaymentStatusChart
          paidCount={stats.paidCount}
          partialCount={stats.partialCount}
          pendingCount={stats.pendingCount}
          overdueCount={stats.overdueCount}
          loading={loading}
          emptyState={
            <EmptyState
              icon={<CurrencyRupeeIcon fontSize="large" />}
              title="No payments recorded"
              message="Record a rent payment and the status split will appear here."
              action={
                <Button component={RouterLink} to="/admin/payments" variant="contained">
                  Record Payment
                </Button>
              }
            />
          }
        />
        <OccupancyChart
          properties={stats.occupancyByProperty}
          loading={loading}
          emptyState={chartEmptyState}
        />
      </Box>

      {/* Collection totals. A thin bar shows collection progress against the
          amount billed, which is the number admins are judged on. */}
      <DashboardSection
        title="Collection this period"
        subtitle={
          stats.totalBilled > 0
            ? `${formatCurrency(stats.totalCollected)} collected of ${formatCurrency(stats.totalBilled)} billed`
            : 'Billed and collected rent across all tenants'
        }
      >
        <Stack spacing={1.5}>
          <Box>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary">
                Collected
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {stats.totalBilled > 0
                  ? `${Math.round((stats.totalCollected / stats.totalBilled) * 100)}%`
                  : '—'}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={
                stats.totalBilled > 0
                  ? Math.min((stats.totalCollected / stats.totalBilled) * 100, 100)
                  : 0
              }
              color="success"
              aria-label="Rent collected against rent billed"
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: (theme) => alpha(theme.palette.success.main, 0.12)
              }}
            />
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 2
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Billed
              </Typography>
              <Typography variant="subtitle1" fontWeight={700}>
                {formatCurrency(stats.totalBilled)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Collected
              </Typography>
              <Typography variant="subtitle1" fontWeight={700} color="success.main">
                {formatCurrency(stats.totalCollected)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Outstanding
              </Typography>
              <Typography variant="subtitle1" fontWeight={700} color="warning.main">
                {formatCurrency(stats.outstandingAmount)}
              </Typography>
            </Box>
          </Box>
        </Stack>
      </DashboardSection>

      {/* Recent activity (design system §6 "Recent activity sections"). */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
          gap: { xs: 2, md: 3 },
          my: 3
        }}
      >
        <DashboardSection
          title="Recent payments"
          subtitle="Latest rent activity"
          action={<ViewAllLink to="/admin/payments" label="View all" />}
          disablePadding
        >
          {recentPayments.length === 0 ? (
            <EmptyState
              icon={<CurrencyRupeeIcon fontSize="large" />}
              title="No payments yet"
              message="Recorded rent payments will show up here."
              action={
                <Button component={RouterLink} to="/admin/payments" variant="contained">
                  Record Payment
                </Button>
              }
            />
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Recent rent payments">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headCellSx}>Tenant</TableCell>
                    <TableCell sx={headCellSx} align="right">Rent</TableCell>
                    <TableCell sx={headCellSx}>Due</TableCell>
                    <TableCell sx={headCellSx}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentPayments.map((payment) => (
                    <TableRow
                      key={payment.id}
                      hover
                      sx={{ '&:last-child td': { borderBottom: 0 } }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {payment.tenant?.name ?? '—'}
                        </Typography>
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
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap>
                          {formatDateOnly(payment.dueDate)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <PaymentStatusChip status={payment.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DashboardSection>

        <DashboardSection
          title="Recent complaints"
          subtitle="Newest tenant complaints"
          action={<ViewAllLink to="/admin/complaints" label="View all" />}
          disablePadding
        >
          {recentComplaints.length === 0 ? (
            <EmptyState
              icon={<ReportProblemIcon fontSize="large" />}
              title="No complaints"
              message="Tenant complaints will show up here as soon as they are filed."
            />
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Recent complaints">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headCellSx}>Complaint</TableCell>
                    <TableCell sx={headCellSx}>Tenant</TableCell>
                    <TableCell sx={headCellSx}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentComplaints.map((complaint) => (
                    <TableRow
                      key={complaint.id}
                      hover
                      sx={{ '&:last-child td': { borderBottom: 0 } }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {complaint.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDateOnly(complaint.createdAt.slice(0, 10))}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap>
                          {complaint.tenant?.name ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <ComplaintStatusChip status={complaint.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DashboardSection>
      </Box>

      {/* Shortcuts into every admin module, so no page is more than one click
          away from the dashboard (design system §5 navigation completeness). */}
      <DashboardSection
        title="Quick actions"
        subtitle="Jump straight into any part of the system"
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
            gap: 2
          }}
        >
          {QUICK_LINKS.map((link) => (
            <Card key={link.to} variant="outlined" sx={{ borderColor: 'divider' }}>
              <CardActionArea component={RouterLink} to={link.to} sx={{ height: '100%', p: 2 }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: 'primary.main',
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1)
                    }}
                  >
                    {link.icon}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {link.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {link.description}
                    </Typography>
                  </Box>
                </Stack>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </DashboardSection>

      {/* Occupancy headline sits with the charts above; this chip row is the
          textual equivalent for screen readers and small screens. */}
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
        sx={{ mt: 3, justifyContent: 'center' }}
      >
        <Chip
          size="small"
          variant="outlined"
          label={`${stats.occupancyPercent}% of beds occupied`}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`${stats.totalAnnouncements} announcement${stats.totalAnnouncements === 1 ? '' : 's'} posted`}
        />
        <Chip size="small" variant="outlined" label={`${stats.totalPayments} payments tracked`} />
        <Chip
          size="small"
          variant="outlined"
          color="success"
          label={`${stats.resolvedComplaints} complaints resolved`}
        />
      </Stack>
    </Box>
  );
}
