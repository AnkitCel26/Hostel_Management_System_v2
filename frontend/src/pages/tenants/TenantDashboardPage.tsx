import React from 'react';
import { useQuery } from '@apollo/client';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Divider,
  LinearProgress,
  Stack,
  Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ApartmentIcon from '@mui/icons-material/Apartment';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CampaignIcon from '@mui/icons-material/Campaign';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import DescriptionIcon from '@mui/icons-material/Description';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import PaymentsIcon from '@mui/icons-material/Payments';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';

import { ComplaintStatusChip } from '../../components/ComplaintStatusChip';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { OccupancyChip } from '../../components/OccupancyChip';
import { PageHeader } from '../../components/PageHeader';
import { PaymentStatusChip } from '../../components/PaymentStatusChip';
import { StatCard } from '../../components/StatCard';
import { DashboardSection } from '../../components/dashboard/DashboardSection';
import { useAuth } from '../../context/AuthContext';
import {
  GET_TENANT_COMPLAINTS_QUERY,
  GET_TENANT_PAYMENT_HISTORY_QUERY,
  GET_TENANT_PG_ANNOUNCEMENTS_QUERY,
  GET_TENANT_PG_ROOM_QUERY
} from '../../graphql/operations';
import type {
  AnnouncementPage,
  Complaint,
  ComplaintPage,
  Pg,
  RentPayment,
  RentPaymentPage,
  Room,
  TenantPgRoom
} from '../../types';
import { getGraphQLErrorMessage } from '../../utils/errors';
import { formatCurrency, formatDate, formatDateOnly } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetTenantPgRoomData {
  getTenantPgRoom: TenantPgRoom | null;
}

interface GetTenantPaymentsData {
  getRentPaymentHistory: RentPaymentPage;
}

interface GetTenantComplaintsData {
  getTenantComplaints: ComplaintPage;
}

interface GetTenantAnnouncementsData {
  getTenantPgAnnouncements: AnnouncementPage;
}

/** How many rows each dashboard feed requests. */
const FEED_SIZE = 5;

/** Tinted icon badge — the homepage / StatCard visual language. */
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

/** The payment that decides the tenant's headline payment status. */
function headlinePayment(payments: RentPayment[]): RentPayment | null {
  if (payments.length === 0) {
    return null;
  }
  // The server already returns newest due date first. Overdue and partial are
  // what a tenant must act on, so either outranks an unpaid future payment.
  return (
    payments.find((payment) => payment.status === 'overdue') ??
    payments.find((payment) => payment.status === 'partial') ??
    payments[0]
  );
}

/** Plain-language next step, matched to the payment status. */
const PAYMENT_NEXT_STEP: Record<string, string> = {
  paid: 'Your rent is fully paid. Nothing to do.',
  partial: 'Part of your rent is paid. Settle the remaining amount with the property team.',
  pending: 'Your rent is due. Pay it by the due date to stay in good standing.',
  overdue: 'Your rent is past due. Please settle it with the property team as soon as possible.'
};

interface QuickLink {
  to: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

/** The tenant's own modules, one click from the dashboard. */
const QUICK_LINKS: QuickLink[] = [
  {
    to: '/tenant/payments',
    label: 'Payments',
    description: 'Check your rent status and history.',
    icon: <PaymentsIcon />
  },
  {
    to: '/tenant/complaints',
    label: 'Report a problem',
    description: 'Tell the property team about an issue.',
    icon: <ReportProblemIcon />
  },
  {
    to: '/tenant/documents',
    label: 'Documents',
    description: 'Upload or view your documents.',
    icon: <DescriptionIcon />
  }
];

/**
 * Tenant dashboard (FR-32, design system §6).
 *
 * Every query used here is already scoped to the calling tenant on the server,
 * so the page needs no tenant-specific dashboard endpoint. It answers four
 * questions in order: where do I live, what rent do I owe, is anything broken,
 * and what is my property team telling me.
 */
export function TenantDashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name.trim().split(' ')[0] ?? '';

  const assignmentQuery = useQuery<GetTenantPgRoomData>(GET_TENANT_PG_ROOM_QUERY);
  const paymentsQuery = useQuery<GetTenantPaymentsData>(GET_TENANT_PAYMENT_HISTORY_QUERY, {
    variables: { limit: FEED_SIZE }
  });
  const complaintsQuery = useQuery<GetTenantComplaintsData>(GET_TENANT_COMPLAINTS_QUERY, {
    variables: { limit: FEED_SIZE }
  });
  const announcementsQuery = useQuery<GetTenantAnnouncementsData>(
    GET_TENANT_PG_ANNOUNCEMENTS_QUERY,
    { variables: { limit: FEED_SIZE } }
  );

  const assignment = assignmentQuery.data?.getTenantPgRoom ?? null;
  const room: Room | null = assignment?.room ?? null;
  const pg: Pg | null = assignment?.pg ?? null;

  const payments = paymentsQuery.data?.getRentPaymentHistory.items ?? [];
  const complaints = complaintsQuery.data?.getTenantComplaints.items ?? [];
  const announcements = announcementsQuery.data?.getTenantPgAnnouncements.items ?? [];

  const current = headlinePayment(payments);
  const openComplaints = complaints.filter(
    (complaint: Complaint) => complaint.status !== 'resolved'
  );
  const totalOutstanding = payments.reduce(
    (sum, payment) => sum + Math.max(payment.amount - payment.paidAmount, 0),
    0
  );

  // Any feed failing is a partial failure: the rest of the page is still
  // useful, so per-panel errors are rendered inside their own panel. Only a
  // failure of the two feeds the whole page depends on (the assignment and
  // the payments) replaces the page with a retry state.
  const criticalError = paymentsQuery.error ?? assignmentQuery.error;
  const criticalLoading = assignmentQuery.loading || paymentsQuery.loading;
  const hasCriticalData =
    assignmentQuery.data !== undefined || paymentsQuery.data !== undefined;

  if (criticalError && !hasCriticalData) {
    return (
      <Box>
        <PageHeader title="Dashboard" subtitle="Your stay, rent, and updates in one place." />
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert
            title="Unable to load your dashboard"
            message={getGraphQLErrorMessage(criticalError)}
          />
          <Button
            variant="outlined"
            onClick={() => {
              void assignmentQuery.refetch();
              void paymentsQuery.refetch();
              void complaintsQuery.refetch();
              void announcementsQuery.refetch();
            }}
          >
            Retry
          </Button>
        </Stack>
      </Box>
    );
  }

  // Nothing has arrived yet and nothing has failed: show the full-page
  // loading state rather than flashing an empty dashboard.
  if (criticalLoading && !hasCriticalData) {
    return (
      <Box>
        <PageHeader title="Dashboard" subtitle="Your stay, rent, and updates in one place." />
        <LoadingIndicator label="Loading your dashboard…" />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Dashboard'}
        subtitle="Your stay, rent, and updates in one place."
      />

      {/* No room yet: the other cards would all be empty, so the page
          explains the one thing the tenant has to do next. */}
      {room === null ? (
        <Card>
          <EmptyState
            icon={<ApartmentIcon fontSize="large" />}
            title="You have not been assigned a room yet"
            message={`Once the administrator places you in a ${PROPERTY_TERM.singularLower} and assigns a room, your rent, payment status, and property announcements will appear here.`}
          />
        </Card>
      ) : (
        <>
          {/* Headline cards (design system §6 tenant dashboard cards). */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' },
              gap: { xs: 2, md: 2.5 },
              mb: 3
            }}
          >
            <StatCard
              icon={<MeetingRoomIcon />}
              label="Current room"
              value={`Room ${room.roomNumber}`}
              sublabel={room.roomType ?? pg?.name ?? undefined}
              tone="primary"
            />
            <StatCard
              icon={<CurrencyRupeeIcon />}
              label="Monthly rent"
              value={formatCurrency(room.rent)}
              sublabel={room.capacity > 0 ? `${room.capacity} bed room` : undefined}
              tone="secondary"
            />
            <StatCard
              icon={<PaymentsIcon />}
              label="Payment status"
              value={
                current === null
                  ? '—'
                  : current.status === 'paid'
                    ? 'Paid'
                    : current.status === 'overdue'
                      ? 'Overdue'
                      : current.status === 'partial'
                        ? 'Partial'
                        : 'Pending'
              }
              sublabel={
                current === null
                  ? 'No payments recorded'
                  : `Due ${formatDateOnly(current.dueDate)}`
              }
              tone={
                current === null
                  ? 'primary'
                  : current.status === 'paid'
                    ? 'success'
                    : current.status === 'overdue'
                      ? 'error'
                      : 'warning'
              }
            />
            <StatCard
              icon={<ReportProblemIcon />}
              label="Open complaints"
              value={String(openComplaints.length)}
              sublabel={
                openComplaints.length === 0
                  ? 'Nothing reported'
                  : 'being looked into'
              }
              tone={openComplaints.length === 0 ? 'success' : 'warning'}
            />
          </Box>

          {/* Outstanding balance: only shown when there is a balance, so a
              tenant who is fully paid sees a clear confirmation instead. */}
          {totalOutstanding > 0 ? (
            <Alert severity={current?.status === 'overdue' ? 'error' : 'info'} sx={{ mb: 3 }}>
              {formatCurrency(totalOutstanding)} of rent is still outstanding across your
              payments. {current ? PAYMENT_NEXT_STEP[current.status] : ''}
            </Alert>
          ) : payments.length > 0 ? (
            <Alert severity="success" sx={{ mb: 3 }}>
              Your rent is fully paid. Nothing is outstanding.
            </Alert>
          ) : null}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '1.1fr 0.9fr' },
              gap: { xs: 2, md: 3 },
              mb: 3
            }}
          >
            {/* Room detail. */}
            <DashboardSection
              title="My room"
              subtitle={pg ? `${pg.name}${pg.city ? `, ${pg.city}` : ''}` : 'Your current room'}
              action={
                <Button
                  component={RouterLink}
                  to="/tenant/room"
                  size="small"
                  endIcon={<ArrowForwardIcon fontSize="small" />}
                >
                  Full details
                </Button>
              }
            >
              <Stack spacing={2}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={iconBadgeSx}>
                    <MeetingRoomIcon />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      Room {room.roomNumber}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {room.roomType ?? 'Room'}{room.floor !== null ? ` · Floor ${room.floor}` : ''}
                    </Typography>
                  </Box>
                  <Box sx={{ ml: 'auto' }}>
                    <OccupancyChip occupied={room.occupiedCount} capacity={room.capacity} />
                  </Box>
                </Stack>
                <Divider />
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 2
                  }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Monthly rent
                    </Typography>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {formatCurrency(room.rent)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {PROPERTY_TERM.singular}
                    </Typography>
                    <Typography variant="subtitle1" fontWeight={600} noWrap>
                      {pg?.name ?? '—'}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </DashboardSection>

            {/* Announcements, newest first. */}
            <DashboardSection
              title="Announcements"
              subtitle={pg ? `From ${pg.name}` : 'Latest from your property'}
              action={
                <Button
                  component={RouterLink}
                  to="/tenant/announcements"
                  size="small"
                  endIcon={<ArrowForwardIcon fontSize="small" />}
                >
                  View all
                </Button>
              }
            >
              {announcementsQuery.error ? (
                <ErrorAlert message={getGraphQLErrorMessage(announcementsQuery.error)} />
              ) : announcements.length === 0 ? (
                <EmptyState
                  icon={<CampaignIcon fontSize="large" />}
                  title="No announcements"
                  message="Notices from your property team will appear here."
                />
              ) : (
                <Stack spacing={1.5} divider={<Divider flexItem />}>
                  {announcements.map((announcement) => (
                    <Box key={announcement.id}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {announcement.title}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mt: 0.25,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}
                      >
                        {announcement.content}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(announcement.createdAt)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </DashboardSection>
          </Box>

          {/* Recent activity: payments and complaints. */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
              gap: { xs: 2, md: 3 },
              mb: 3
            }}
          >
            <DashboardSection
              title="Recent payments"
              subtitle="Your latest rent records"
              action={
                <Button
                  component={RouterLink}
                  to="/tenant/payments"
                  size="small"
                  endIcon={<ArrowForwardIcon fontSize="small" />}
                >
                  View all
                </Button>
              }
            >
              {paymentsQuery.error ? (
                <ErrorAlert message={getGraphQLErrorMessage(paymentsQuery.error)} />
              ) : payments.length === 0 ? (
                <EmptyState
                  icon={<PaymentsIcon fontSize="large" />}
                  title="No payments yet"
                  message="When your property manager records a rent payment, it will show up here."
                />
              ) : (
                <Stack spacing={1.5} divider={<Divider flexItem />}>
                  {payments.map((payment) => (
                    <Stack
                      key={payment.id}
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {formatCurrency(payment.amount)} · due{' '}
                          {formatDateOnly(payment.dueDate)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {payment.paidAmount > 0
                            ? `${formatCurrency(payment.paidAmount)} paid`
                            : 'Nothing paid yet'}
                        </Typography>
                      </Box>
                      <PaymentStatusChip status={payment.status} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </DashboardSection>

            <DashboardSection
              title="My complaints"
              subtitle="Problems you have reported"
              action={
                <Button
                  component={RouterLink}
                  to="/tenant/complaints"
                  size="small"
                  endIcon={<ArrowForwardIcon fontSize="small" />}
                >
                  View all
                </Button>
              }
            >
              {complaintsQuery.error ? (
                <ErrorAlert message={getGraphQLErrorMessage(complaintsQuery.error)} />
              ) : complaints.length === 0 ? (
                <EmptyState
                  icon={<ReportProblemIcon fontSize="large" />}
                  title="No complaints"
                  message="Something wrong in your room or the common area? Report it and the property team will pick it up."
                  action={
                    <Button
                      component={RouterLink}
                      to="/tenant/complaints"
                      variant="contained"
                    >
                      Report Complaint
                    </Button>
                  }
                />
              ) : (
                <Stack spacing={1.5} divider={<Divider flexItem />}>
                  {complaints.map((complaint) => (
                    <Box key={complaint.id}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {complaint.title}
                        </Typography>
                        <ComplaintStatusChip status={complaint.status} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Filed {formatDate(complaint.createdAt)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </DashboardSection>
          </Box>

          {/* Shortcuts into the rest of the tenant portal. */}
          <DashboardSection title="Quick actions" subtitle="Everything else you can do here">
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                gap: 2
              }}
            >
              {QUICK_LINKS.map((link) => (
                <Card key={link.to} variant="outlined" sx={{ borderColor: 'divider' }}>
                  <CardActionArea component={RouterLink} to={link.to} sx={{ height: '100%', p: 2 }}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <Box sx={iconBadgeSx}>{link.icon}</Box>
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
        </>
      )}

      {/* Loading strip while the non-critical feeds settle, so a slow
          announcements query is visible without blocking the page. */}
      {announcementsQuery.loading || complaintsQuery.loading ? (
        <LinearProgress
          aria-label="Refreshing your dashboard"
          sx={{ mt: 2 }}
        />
      ) : null}
    </Box>
  );
}
