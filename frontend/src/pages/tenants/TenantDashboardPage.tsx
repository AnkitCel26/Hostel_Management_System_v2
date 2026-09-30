import React from 'react';
import { useQuery } from '@apollo/client';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  Divider,
  LinearProgress,
  Stack,
  Typography
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import ApartmentIcon from '@mui/icons-material/Apartment';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CampaignIcon from '@mui/icons-material/Campaign';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DescriptionIcon from '@mui/icons-material/Description';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import PaymentsIcon from '@mui/icons-material/Payments';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import ScheduleIcon from '@mui/icons-material/Schedule';

import { ComplaintStatusChip } from '../../components/ComplaintStatusChip';
import { DetailItem } from '../../components/DetailItem';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { OccupancyChip } from '../../components/OccupancyChip';
import { PageHeader } from '../../components/PageHeader';
import { PayRentDialog } from '../../components/PayRentDialog';
import { PaymentStatusChip } from '../../components/PaymentStatusChip';
import { StatCard } from '../../components/StatCard';
import { DashboardSection } from '../../components/dashboard/DashboardSection';
import { useAuth } from '../../context/AuthContext';
import { useSnackbar } from '../../context/SnackbarContext';
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

/**
 * One spacing rhythm for the whole page. Every grid and every stack gap uses
 * this value, so the vertical lines of the stat row, the two panel rows, and
 * the quick-action row all line up instead of drifting apart.
 */
const GAP = 3;

/** The colour roles a status panel or stat tile can take. */
type RentTone = 'primary' | 'success' | 'info' | 'warning' | 'error';

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
  bgcolor: (theme: Theme) => alpha(theme.palette.primary.main, 0.1)
} as const;

/** Tinted icon badge in an explicit tone colour (status panels). */
const toneBadgeSx = (tone: RentTone) => ({
  width: 44,
  height: 44,
  borderRadius: 2.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: `${tone}.main`,
  bgcolor: (theme: Theme) => alpha(theme.palette[tone].main, 0.12)
});

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

/**
 * Status colour and icon per payment status. The "none" pseudo-status is a
 * tenant who has no rent record yet, so the panel reads as informational
 * rather than alarming.
 */
const RENT_TONE: Record<'none' | RentPayment['status'], RentTone> = {
  none: 'primary',
  paid: 'success',
  pending: 'info',
  partial: 'warning',
  overdue: 'error'
};

/** Status word shown in the big-value column of the stat row. */
const RENT_STATUS_WORD: Record<'none' | RentPayment['status'], string> = {
  none: '—',
  paid: 'Paid',
  pending: 'Pending',
  partial: 'Partial',
  overdue: 'Overdue'
};

const RENT_TONE_ICON: Record<RentTone, React.ReactNode> = {
  primary: <ReceiptLongIcon />,
  success: <CheckCircleIcon />,
  info: <ScheduleIcon />,
  warning: <InfoOutlinedIcon />,
  error: <ErrorOutlineIcon />
};

interface RentStatusPanelProps {
  current: RentPayment | null;
  monthlyRent: number;
  onPay: (payment: RentPayment) => void;
}

/**
 * Rent status panel — the one thing a tenant opens this page for. Replaces a
 * bare alert with the same panel language the admin dashboard uses for its
 * collection summary: tinted status badge, one headline line, a progress bar
 * for the current cycle, and the billed / paid / outstanding figures.
 */
function RentStatusPanel({ current, monthlyRent, onPay }: RentStatusPanelProps) {
  const status = current?.status ?? 'none';
  const tone = RENT_TONE[status];

  const amount = current?.amount ?? 0;
  const paidAmount = current?.paidAmount ?? 0;
  const remaining = Math.max(amount - paidAmount, 0);
  const percent = amount > 0 ? Math.min(Math.round((paidAmount / amount) * 100), 100) : 0;

  const headline = (): { title: string; message: string } => {
    if (current === null) {
      return {
        title: 'No rent records yet',
        message: `Your rent is ${formatCurrency(monthlyRent)} per month. Your property team has not raised a rent record for you yet.`
      };
    }
    if (status === 'paid') {
      return {
        title: 'Rent fully paid',
        message: 'Nothing is outstanding for this cycle. Your next rent record will appear here when it is raised.'
      };
    }
    if (status === 'overdue') {
      return {
        title: `${formatCurrency(remaining)} overdue`,
        message: `This was due on ${formatDateOnly(current.dueDate)}. Please settle it with the property team as soon as possible.`
      };
    }
    if (status === 'partial') {
      return {
        title: `${formatCurrency(remaining)} remaining`,
        message: `You have paid ${formatCurrency(paidAmount)} of ${formatCurrency(amount)} so far. Settle the rest with the property team.`
      };
    }
    return {
      title: `${formatCurrency(remaining)} due`,
      message: `Pay by ${formatDateOnly(current.dueDate)} to stay in good standing.`
    };
  };

  const { title, message } = headline();

  return (
    <Card>
      <Box sx={{ p: 2.5 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ sm: 'center' }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
            <Box sx={toneBadgeSx(tone)}>{RENT_TONE_ICON[tone]}</Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" component="h2" sx={{ fontSize: '1.0625rem', fontWeight: 700 }}>
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {message}
              </Typography>
            </Box>
          </Stack>
          {remaining > 0 && current !== null ? (
            <Button
              variant="contained"
              onClick={() => onPay(current)}
              startIcon={<PaymentsIcon />}
              sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'center' } }}
            >
              Pay rent
            </Button>
          ) : null}
        </Stack>

        <Box sx={{ mt: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight={600}
              sx={{ letterSpacing: 1, textTransform: 'uppercase' }}
            >
              Paid this cycle
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {current === null
                ? '—'
                : `${formatCurrency(paidAmount)} of ${formatCurrency(amount)}`}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={percent}
            color={tone === 'primary' ? 'primary' : tone}
            aria-label={`${percent} percent of rent paid`}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: (theme) => alpha(theme.palette[tone].main, 0.12)
            }}
          />
        </Box>

        <Divider sx={{ my: 2.5 }} />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            columnGap: GAP,
            rowGap: 2
          }}
        >
          <DetailItem label="Billed" value={formatCurrency(amount)} />
          <DetailItem
            label="Paid"
            value={
              <Box component="span" sx={{ color: paidAmount > 0 ? 'success.main' : 'text.primary' }}>
                {formatCurrency(paidAmount)}
              </Box>
            }
          />
          <DetailItem
            label="Outstanding"
            value={
              <Box component="span" sx={{ color: remaining > 0 ? 'error.main' : 'text.primary' }}>
                {formatCurrency(remaining)}
              </Box>
            }
          />
        </Box>
      </Box>
    </Card>
  );
}

/** Clamp helper: cap a block at `lines` and hide the rest. */
function clampLines(lines: number) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden'
  };
}

/** Single-line ellipsis for text that must not change a row's height. */
const singleLineSx = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} as const;

interface FeedRowProps {
  /** Route the whole row navigates to. */
  to: string;
  title: string;
  /** Small muted line under the title: a date, an amount paid, or a preview. */
  meta: React.ReactNode;
  /** Status chip or date, right-aligned. */
  trailing?: React.ReactNode;
  /** Lines the title may occupy before it is clamped. */
  titleLines?: 1 | 2;
  /** Lines the meta preview may occupy before it is clamped. */
  metaLines?: 1 | 2;
}

/**
 * One row in a dashboard feed. Payments, complaints, and announcements all use
 * this same anatomy — a text column on the left, a status or date on the
 * right, and a minimum height — so the three panels read as one table-like
 * system rather than three differently spaced lists. The row is one link, so
 * the whole strip is a single, keyboard-accessible target.
 */
function FeedRow({
  to,
  title,
  meta,
  trailing,
  titleLines = 1,
  metaLines = 1
}: FeedRowProps) {
  return (
    <Box
      component={RouterLink}
      to={to}
      sx={{
        display: 'grid',
        gridTemplateColumns: trailing ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
        alignItems: 'center',
        columnGap: 2,
        minHeight: 60,
        py: 1.25,
        px: 1,
        mx: -1,
        borderRadius: 2,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'background-color 150ms ease',
        '&:hover': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05) },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: -2
        }
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="body2"
          fontWeight={600}
          sx={titleLines === 1 ? singleLineSx : clampLines(titleLines)}
        >
          {title}
        </Typography>
        <Typography
          component="p"
          sx={{
            mt: 0.25,
            color: 'text.secondary',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            ...(metaLines === 1 ? singleLineSx : clampLines(metaLines))
          }}
        >
          {meta}
        </Typography>
      </Box>
      {trailing ? <Box sx={{ flexShrink: 0, textAlign: 'right' }}>{trailing}</Box> : null}
    </Box>
  );
}

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
    description: 'Check your rent status and pay what is due.',
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
 * Tenant dashboard (FR-32, design system §6).
 *
 * Every query used here is already scoped to the calling tenant on the server,
 * so the page needs no tenant-specific dashboard endpoint. It answers four
 * questions in order: what rent do I owe, where do I live, is anything broken,
 * and what is my property team telling me.
 *
 * Layout: every row on the page is a grid using the same `GAP`, so the column
 * edges of the stat row, the two panel rows, and the quick-action row line up
 * down the page. Cards in a row stretch to the tallest card rather than being
 * sized by their own content, so the row reads as one band.
 */
export function TenantDashboardPage() {
  const { user } = useAuth();
  const { success } = useSnackbar();
  const firstName = user?.name.trim().split(' ')[0] ?? '';

  const [payDialog, setPayDialog] = React.useState<{
    open: boolean;
    payment: RentPayment | null;
  }>({ open: false, payment: null });

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
  const outstanding = current === null ? 0 : Math.max(current.amount - current.paidAmount, 0);

  // Any feed failing is a partial failure: the rest of the page is still
  // useful, so per-panel errors are rendered inside their own panel. Only a
  // failure of the two feeds the whole page depends on (the assignment and
  // the payments) replaces the page with a retry state.
  const criticalError = paymentsQuery.error ?? assignmentQuery.error;
  const criticalLoading = assignmentQuery.loading || paymentsQuery.loading;
  const hasCriticalData =
    assignmentQuery.data !== undefined || paymentsQuery.data !== undefined;

  // A quiet refresh strip: the non-critical feeds settle in the background and
  // must not block the panels that already have data.
  const backgroundLoading = complaintsQuery.loading || announcementsQuery.loading;
  const anyLoading = criticalLoading || backgroundLoading;

  const openPay = (payment: RentPayment): void =>
    setPayDialog({ open: true, payment });
  const closePayDialog = (): void => setPayDialog({ open: false, payment: null });

  const handlePaid = (message: string): void => {
    closePayDialog();
    success(message);
    void paymentsQuery.refetch();
  };

  const refetchAll = (): void => {
    void assignmentQuery.refetch();
    void paymentsQuery.refetch();
    void complaintsQuery.refetch();
    void announcementsQuery.refetch();
  };

  if (criticalError && !hasCriticalData) {
    return (
      <Box>
        <PageHeader title="Dashboard" subtitle="Your stay, rent, and updates in one place." />
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert
            title="Unable to load your dashboard"
            message={getGraphQLErrorMessage(criticalError)}
          />
          <Button variant="outlined" onClick={refetchAll}>
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

  const quickActions = (
    <DashboardSection title="Quick actions" subtitle="Everything else you can do in this portal">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 2
        }}
      >
        {QUICK_LINKS.map((link) => (
          <Card
            key={link.to}
            variant="outlined"
            sx={{
              borderColor: 'divider',
              transition: 'border-color 150ms ease, box-shadow 150ms ease',
              '&:hover': {
                borderColor: 'primary.main',
                boxShadow: '0 4px 12px rgba(16, 24, 40, 0.08)'
              }
            }}
          >
            <CardActionArea component={RouterLink} to={link.to} sx={{ height: '100%', p: 2.5 }}>
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <Box sx={iconBadgeSx}>{link.icon}</Box>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {link.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {link.description}
                  </Typography>
                </Box>
                <ArrowForwardIcon
                  fontSize="small"
                  sx={{ color: 'text.secondary', opacity: 0.6, flexShrink: 0, mt: 1.25 }}
                />
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </DashboardSection>
  );

  return (
    <Box>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Dashboard'}
        subtitle="Your stay, rent, and updates in one place."
        action={
          <Button variant="outlined" onClick={refetchAll} disabled={anyLoading}>
            {anyLoading ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      {/* Thin progress strip while a background refresh is in flight, matching
          the management pages' pattern. */}
      {backgroundLoading && hasCriticalData ? (
        <LinearProgress
          aria-label="Refreshing your dashboard"
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: (theme) => theme.zIndex.appBar + 1
          }}
        />
      ) : null}

      {/* No room yet: the panels that depend on an assignment would all be
          empty, so the page leads with the one thing the tenant has to do
          next — the rest of the portal stays reachable below. */}
      {room === null ? (
        <>
          <Card>
            <EmptyState
              icon={<ApartmentIcon fontSize="large" />}
              title="You have not been assigned a room yet"
              message={`Once the administrator places you in a ${PROPERTY_TERM.singularLower} and assigns a room, your rent, payment status, and property announcements will appear here.`}
            />
          </Card>
          <Box sx={{ mt: GAP }}>{quickActions}</Box>
        </>
      ) : (
        <>
          {/* Headline cards (design system §6 tenant dashboard cards). */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                lg: 'repeat(4, minmax(0, 1fr))'
              },
              gap: GAP,
              mb: GAP
            }}
          >
            <StatCard
              icon={<MeetingRoomIcon />}
              label="Current room"
              value={`Room ${room.roomNumber}`}
              sublabel={pg?.name ?? (room.roomType ?? 'Your room')}
              tone="primary"
            />
            <StatCard
              icon={<PaymentsIcon />}
              label="Monthly rent"
              value={formatCurrency(room.rent)}
              sublabel="per month"
              tone="secondary"
            />
            <StatCard
              // The icon follows the same status → tone mapping as the panel
              // below, so a glance at the row already says which state it is.
              icon={RENT_TONE_ICON[RENT_TONE[current?.status ?? 'none']]}
              label="Payment status"
              value={RENT_STATUS_WORD[current?.status ?? 'none']}
              sublabel={
                current === null
                  ? 'No payments recorded'
                  : outstanding > 0
                    ? `${formatCurrency(outstanding)} due`
                    : `Paid ${formatDateOnly(current.paidDate)}`
              }
              tone={
                current === null
                  ? 'primary'
                  : current.status === 'paid'
                    ? 'success'
                    : current.status === 'overdue'
                      ? 'error'
                      : current.status === 'partial'
                        ? 'warning'
                        : 'info'
              }
            />
            <StatCard
              icon={<ReportProblemIcon />}
              label="Open complaints"
              value={String(openComplaints.length)}
              sublabel={
                openComplaints.length === 0
                  ? 'Nothing reported'
                  : openComplaints.length === 1
                    ? '1 being looked into'
                    : 'being looked into'
              }
              tone={openComplaints.length === 0 ? 'success' : 'warning'}
            />
          </Box>

          {/* Rent status: the one panel a tenant comes here for. */}
          <Box sx={{ mb: GAP }}>
            <RentStatusPanel current={current} monthlyRent={room.rent} onPay={openPay} />
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
              gap: GAP,
              mb: GAP
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
              {/* Grows with the panel so the sharing note is pinned to the
                  bottom when the announcements panel next to it is taller. */}
              <Stack spacing={2.5} sx={{ flexGrow: 1 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={iconBadgeSx}>
                    <MeetingRoomIcon />
                  </Box>
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700} noWrap>
                      Room {room.roomNumber}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {[room.roomType ?? 'Room', room.floor !== null ? `Floor ${room.floor}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  </Box>
                  <Box sx={{ flexShrink: 0 }}>
                    <OccupancyChip occupied={room.occupiedCount} capacity={room.capacity} />
                  </Box>
                </Stack>

                <Divider />

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    columnGap: GAP,
                    rowGap: 2
                  }}
                >
                  <DetailItem label="Monthly rent" value={`${formatCurrency(room.rent)} / month`} />
                  <DetailItem
                    label={PROPERTY_TERM.singular}
                    value={pg?.name ?? '—'}
                  />
                  <DetailItem label="Room type" value={room.roomType ?? 'Not set'} />
                  <DetailItem
                    label="Beds occupied"
                    value={`${room.occupiedCount} of ${room.capacity}`}
                  />
                </Box>

                <Stack
                  direction="row"
                  spacing={1.25}
                  alignItems="center"
                  sx={{
                    mt: 'auto',
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
                  compact
                  icon={<CampaignIcon fontSize="large" />}
                  title="No announcements"
                  message="Notices from your property team will appear here."
                />
              ) : (
                <Stack divider={<Divider flexItem />} sx={{ flexGrow: 1 }}>
                  {announcements.map((announcement) => (
                    <Box key={announcement.id} sx={{ py: 0.75, '&:first-of-type': { pt: 0 } }}>
                      <FeedRow
                        to="/tenant/announcements"
                        title={announcement.title}
                        meta={announcement.content}
                        metaLines={2}
                        trailing={
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {formatDate(announcement.createdAt)}
                          </Typography>
                        }
                      />
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
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
              gap: GAP,
              mb: GAP
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
                  compact
                  icon={<PaymentsIcon fontSize="large" />}
                  title="No payments yet"
                  message="When your property manager records a rent payment, it will show up here."
                />
              ) : (
                <Stack divider={<Divider flexItem />} sx={{ flexGrow: 1 }}>
                  {payments.map((payment) => (
                    <Box key={payment.id} sx={{ py: 0.75, '&:first-of-type': { pt: 0 } }}>
                      <FeedRow
                        to="/tenant/payments"
                        title={`${formatCurrency(payment.amount)} due ${formatDateOnly(payment.dueDate)}`}
                        meta={
                          payment.paidAmount > 0
                            ? `${formatCurrency(payment.paidAmount)} paid`
                            : 'Nothing paid yet'
                        }
                        titleLines={2}
                        trailing={<PaymentStatusChip status={payment.status} />}
                      />
                    </Box>
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
                  compact
                  icon={<ReportProblemIcon fontSize="large" />}
                  title="No complaints"
                  message="Something wrong in your room or a common area? Report it and the property team will pick it up."
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
                <Stack divider={<Divider flexItem />} sx={{ flexGrow: 1 }}>
                  {complaints.map((complaint) => (
                    <Box key={complaint.id} sx={{ py: 0.75, '&:first-of-type': { pt: 0 } }}>
                      <FeedRow
                        to="/tenant/complaints"
                        title={complaint.title}
                        meta={`Filed ${formatDate(complaint.createdAt)}`}
                        trailing={<ComplaintStatusChip status={complaint.status} />}
                        titleLines={2}
                      />
                    </Box>
                  ))}
                </Stack>
              )}
            </DashboardSection>
          </Box>

          {/* Shortcuts into the rest of the tenant portal. */}
          {quickActions}
        </>
      )}

      <PayRentDialog
        open={payDialog.open}
        payment={payDialog.payment}
        onClose={closePayDialog}
        onPaid={handlePaid}
      />
    </Box>
  );
}
