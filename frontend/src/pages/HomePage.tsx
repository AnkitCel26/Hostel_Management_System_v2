import React from 'react';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CampaignIcon from '@mui/icons-material/Campaign';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DescriptionIcon from '@mui/icons-material/Description';
import LogoutIcon from '@mui/icons-material/Logout';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import PaymentsIcon from '@mui/icons-material/Payments';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import PersonIcon from '@mui/icons-material/Person';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';

import { FeatureCard } from '../components/FeatureCard';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { ProductPreview } from '../components/ProductPreview';
import { useAuth } from '../context/AuthContext';
import type { AuthUser } from '../types';
import { PROPERTY_TERM } from '../utils/labels';
import { getHomePath } from '../utils/navigation';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  subtitle: string;
}

function SectionHeading({ eyebrow, title, subtitle }: SectionHeadingProps) {
  return (
    <Box sx={{ textAlign: 'center', maxWidth: 640, mx: 'auto', mb: { xs: 4, md: 6 } }}>
      <Typography
        variant="overline"
        component="p"
        color="primary"
        fontWeight={600}
        letterSpacing={1.4}
      >
        {eyebrow}
      </Typography>
      <Typography
        variant="h2"
        component="h2"
        sx={{ mt: 1, fontSize: { xs: '1.625rem', md: '2rem' } }}
      >
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.5 }}>
        {subtitle}
      </Typography>
    </Box>
  );
}

function GuestHero() {
  return (
    <Box component="section" sx={{ py: { xs: 4, md: 8 } }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { md: '1.05fr 0.95fr' },
          gap: { xs: 5, md: 7 },
          alignItems: 'center',
          textAlign: { xs: 'center', md: 'left' }
        }}
      >
        <Box>
          <Typography
            variant="overline"
            component="p"
            color="primary"
            fontWeight={600}
            letterSpacing={1.4}
          >
            Hostel &amp; {PROPERTY_TERM.singularLower} management platform
          </Typography>
          <Typography
            variant="h1"
            component="h1"
            sx={{ mt: 1.5, fontSize: { xs: '2.125rem', sm: '2.75rem', md: '3.25rem' } }}
          >
            Run your entire hostel operation in one place
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mt: 2.5, maxWidth: 560, mx: { xs: 'auto', md: 0 } }}
          >
            Manage {PROPERTY_TERM.pluralLower}, rooms, tenants, rent payments, complaints, and
            announcements from a single, organized dashboard — built for both administrators and
            tenants.
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{ mt: 4, justifyContent: { xs: 'center', md: 'flex-start' } }}
          >
            <Button
              component={RouterLink}
              to="/register"
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon />}
            >
              Create account
            </Button>
            <Button component={RouterLink} to="/login" variant="outlined" size="large">
              Login
            </Button>
          </Stack>
        </Box>
        <ProductPreview />
      </Box>
    </Box>
  );
}

const FEATURES = [
  {
    icon: <MeetingRoomIcon />,
    title: `${PROPERTY_TERM.singular} & Room Management`,
    description: 'Organize properties, rooms, beds, and occupancy at a glance.'
  },
  {
    icon: <PeopleAltIcon />,
    title: 'Tenant Management',
    description: 'Onboard tenants, track their details, and keep records in order.'
  },
  {
    icon: <PaymentsIcon />,
    title: 'Rent & Payments',
    description: 'Record rent payments and keep track of pending or overdue dues.'
  },
  {
    icon: <SupportAgentIcon />,
    title: 'Complaints',
    description: 'Log, track, and resolve maintenance issues without losing context.'
  },
  {
    icon: <CampaignIcon />,
    title: 'Announcements',
    description: 'Broadcast notices and updates to every tenant instantly.'
  },
  {
    icon: <DescriptionIcon />,
    title: 'Documents',
    description: 'Keep tenant documents organized and easy to access when needed.'
  }
];

function FeaturesSection() {
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 8 } }}>
      <SectionHeading
        eyebrow="Everything you need"
        title="One platform for the whole property"
        subtitle="From onboarding tenants to collecting rent, every module works together in a single system."
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
          gap: 3
        }}
      >
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </Box>
    </Box>
  );
}

interface RoleCard {
  icon: ReactNode;
  tone: 'primary' | 'secondary';
  title: string;
  description: string;
  points: string[];
  cta: { label: string; to: string; variant: 'contained' | 'outlined' };
}

const ROLE_CARDS: RoleCard[] = [
  {
    icon: <AdminPanelSettingsIcon />,
    tone: 'primary',
    title: 'For Administrators',
    description: 'Everything needed to run the property day to day.',
    points: [
      `Set up ${PROPERTY_TERM.pluralLower}, rooms, and beds`,
      'Onboard tenants and manage their documents',
      'Track rent payments and pending dues',
      'Resolve complaints and post announcements'
    ],
    cta: { label: 'Get started', to: '/register', variant: 'contained' }
  },
  {
    icon: <PersonIcon />,
    tone: 'secondary',
    title: 'For Tenants',
    description: 'A simple portal for everything about your stay.',
    points: [
      'View your room details and current rent',
      'Check payment status and history',
      'Raise complaints and follow their progress',
      'Read announcements and access documents'
    ],
    cta: { label: 'Login', to: '/login', variant: 'outlined' }
  }
];

function RolesSection() {
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 8 } }}>
      <SectionHeading
        eyebrow="Built for both sides"
        title="One system, two focused portals"
        subtitle="Administrators get full operational control. Tenants get a clear view of their stay."
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
          gap: 3,
          maxWidth: 900,
          mx: 'auto'
        }}
      >
        {ROLE_CARDS.map((card) => (
          <Card
            key={card.title}
            sx={{
              height: '100%',
              transition: 'transform 180ms ease, box-shadow 180ms ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 24px rgba(16, 24, 40, 0.08)'
              }
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                  color: `${card.tone}.main`,
                  bgcolor: (theme) => alpha(theme.palette[card.tone].main, 0.1)
                }}
              >
                {card.icon}
              </Box>
              <Typography variant="h5" component="h3" gutterBottom>
                {card.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {card.description}
              </Typography>
              <List dense disablePadding sx={{ mt: 2 }}>
                {card.points.map((point) => (
                  <ListItem key={point} disableGutters sx={{ py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <CheckCircleOutlineIcon color={card.tone} fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={point}
                      slotProps={{ primary: { variant: 'body2' } }}
                    />
                  </ListItem>
                ))}
              </List>
              <Button
                component={RouterLink}
                to={card.cta.to}
                variant={card.cta.variant}
                endIcon={<ArrowForwardIcon />}
                sx={{ mt: 2.5 }}
              >
                {card.cta.label}
              </Button>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

function CtaSection() {
  return (
    <Box component="section" sx={{ py: { xs: 5, md: 8 } }}>
      <Card sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <CardContent sx={{ p: { xs: 4, md: 6 }, textAlign: 'center' }}>
          <Typography variant="h4" component="h2" sx={{ color: 'inherit' }}>
            Ready to simplify hostel management?
          </Typography>
          <Typography sx={{ mt: 1.5, opacity: 0.92, maxWidth: 520, mx: 'auto' }}>
            Create an account or log in to access your portal.
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            justifyContent="center"
            sx={{ mt: 3.5 }}
          >
            <Button
              component={RouterLink}
              to="/register"
              variant="contained"
              size="large"
              sx={{
                bgcolor: 'common.white',
                color: 'primary.main',
                '&:hover': { bgcolor: 'grey.100' }
              }}
            >
              Create account
            </Button>
            <Button
              component={RouterLink}
              to="/login"
              variant="outlined"
              size="large"
              sx={{
                color: 'common.white',
                borderColor: 'rgba(255, 255, 255, 0.6)',
                '&:hover': { borderColor: 'common.white', bgcolor: 'rgba(255, 255, 255, 0.08)' }
              }}
            >
              Login
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

interface QuickAction {
  icon: ReactNode;
  title: string;
  description: string;
  danger?: boolean;
  to?: string;
  onClick?: () => void;
}

function ActionCard({ icon, title, description, danger, to, onClick }: QuickAction) {
  const content = (
    <>
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 1.5,
          color: danger ? 'error.main' : 'primary.main',
          bgcolor: (theme) =>
            alpha(danger ? theme.palette.error.main : theme.palette.primary.main, 0.1)
        }}
      >
        {icon}
      </Box>
      <Typography variant="subtitle1" component="h2" fontWeight={600}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {description}
      </Typography>
    </>
  );

  const areaSx = { height: '100%', p: 2.5, textAlign: 'left' } as const;

  return (
    <Card
      sx={{
        height: '100%',
        transition: 'transform 180ms ease, box-shadow 180ms ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 24px rgba(16, 24, 40, 0.08)'
        }
      }}
    >
      {to ? (
        <CardActionArea component={RouterLink} to={to} sx={areaSx}>
          {content}
        </CardActionArea>
      ) : (
        <CardActionArea component="button" type="button" onClick={onClick} sx={areaSx}>
          {content}
        </CardActionArea>
      )}
    </Card>
  );
}

function WelcomeBack({ user }: { user: AuthUser }) {
  const { logout } = useAuth();
  const firstName = user.name.trim().split(' ')[0];

  const actions: QuickAction[] = [
    {
      icon: <DashboardIcon />,
      title: 'Go to dashboard',
      description: 'Jump back into your portal and pick up where you left off.',
      to: getHomePath(user.role)
    },
    {
      icon: <PersonIcon />,
      title: 'Profile',
      description: 'View and update your name and contact details.',
      to: '/profile'
    },
    {
      icon: <LogoutIcon />,
      title: 'Logout',
      description: 'Sign out of your account on this device.',
      danger: true,
      onClick: () => void logout()
    }
  ];

  return (
    <Box component="section" sx={{ py: { xs: 5, md: 9 }, textAlign: 'center' }}>
      <Chip
        label={user.role === 'Admin' ? 'Administrator' : 'Tenant'}
        color={user.role === 'Admin' ? 'secondary' : 'primary'}
        size="small"
        sx={{ mb: 2 }}
      />
      <Typography
        variant="h1"
        component="h1"
        sx={{ fontSize: { xs: '2rem', sm: '2.5rem', md: '2.75rem' } }}
      >
        Welcome back, {firstName}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.5 }}>
        You are signed in as {user.email}.
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          gap: 2.5,
          maxWidth: 880,
          mx: 'auto',
          mt: { xs: 4, md: 5 },
          textAlign: 'left'
        }}
      >
        {actions.map((action) => (
          <ActionCard key={action.title} {...action} />
        ))}
      </Box>
    </Box>
  );
}

export function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingIndicator label="Loading session" />;
  }

  if (user) {
    return <WelcomeBack user={user} />;
  }

  return (
    <>
      <GuestHero />
      <FeaturesSection />
      <RolesSection />
      <CtaSection />
    </>
  );
}
