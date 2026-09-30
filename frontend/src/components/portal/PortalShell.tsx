import React from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import {
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ApartmentIcon from '@mui/icons-material/Apartment';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import PersonIcon from '@mui/icons-material/Person';

import { useAuth } from '../../context/AuthContext';
import { GET_ALL_PGS_ROOMS_QUERY, GET_TENANT_PG_ROOM_QUERY } from '../../graphql/operations';
import type { Pg, TenantPgRoom } from '../../types';
import { formatCurrency, getInitials } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';
import { SystemStatus } from '../SystemStatus';
import { getPortalNav, getPortalTitle } from './portalNav';

const SIDEBAR_WIDTH = 264;
const MOBILE_DRAWER_WIDTH = 280;
/** Shared height of the sidebar brand row and the top bar, so their bottom
 * edges form one continuous horizontal line across the viewport. */
const TOPBAR_HEIGHT = 64;

/** Brand block — identical mark and wordmark style as the public header. */
function PortalBrand({ caption }: { caption: string }) {
  return (
    <Box
      component={RouterLink}
      to="/"
      aria-label="Hostel Management System home"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        // Matches the top bar height exactly: the divider below this block and
        // the top bar's bottom border meet in one continuous line.
        height: TOPBAR_HEIGHT,
        // Aligns the badge with the nav icons below (nav container 12px + item 10px).
        px: 2.75,
        color: 'inherit',
        textDecoration: 'none'
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: 2,
          bgcolor: 'primary.main',
          color: 'common.white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <ApartmentIcon sx={{ fontSize: 19 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="subtitle2"
          sx={{ fontSize: '0.875rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.005em' }}
          noWrap
        >
          Hostel Management
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ lineHeight: 1.4 }}
        >
          {caption}
        </Typography>
      </Box>
    </Box>
  );
}

interface PortalNavListProps {
  onNavigate?: () => void;
}

/**
 * Sectioned navigation. Follows the compact SaaS pattern (Linear/Stripe):
 * 36px rows, 13px medium-weight labels, 20px icons, muted default color,
 * subtle hover, and a primary-tinted active pill. Typography stays inside
 * the app's Inter scale (theme.ts) — only size/weight are tuned here.
 */
function PortalNavList({ onNavigate }: PortalNavListProps) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return null;

  const sections = getPortalNav(user.role);

  return (
    <Box component="nav" aria-label="Portal navigation" sx={{ px: 1.5, py: 1.5 }}>
      {sections.map((section, sectionIndex) => (
        <List
          key={section.label}
          disablePadding
          sx={{ pt: sectionIndex === 0 ? 0 : 2.5 }}
          subheader={
            <ListSubheader
              component="div"
              disableGutters
              sx={{
                bgcolor: 'transparent',
                px: 1.25,
                pb: 0.5,
                lineHeight: '20px',
                fontSize: '0.6875rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'text.secondary'
              }}
            >
              {section.label}
            </ListSubheader>
          }
        >
          {section.items.map((item) => {
            const selected =
              location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={item.to}
                selected={selected}
                onClick={onNavigate}
                aria-current={selected ? 'page' : undefined}
                sx={{
                  height: 36,
                  px: 1.25,
                  mb: 0.25,
                  borderRadius: 2,
                  color: 'text.secondary',
                  transition: 'background-color 150ms ease, color 150ms ease',
                  '& .MuiListItemIcon-root': {
                    minWidth: 32,
                    color: 'inherit',
                    '& .MuiSvgIcon-root': { fontSize: 20 }
                  },
                  '& .MuiListItemText-primary': {
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    letterSpacing: '0.005em'
                  },
                  '&:hover': {
                    bgcolor: (theme) => alpha(theme.palette.text.primary, 0.05),
                    color: 'text.primary'
                  },
                  '&.Mui-selected': {
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                    color: 'primary.main',
                    '& .MuiListItemText-primary': { fontWeight: 600 },
                    '&:hover': {
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.14)
                    }
                  }
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} slotProps={{ primary: { noWrap: true } }} />
              </ListItemButton>
            );
          })}
        </List>
      ))}
    </Box>
  );
}

interface SidebarContentProps {
  onNavigate?: () => void;
  onLogout: () => void;
}

/** Shared frame for the small live summary cards pinned above the user block. */
function InsightCard({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ px: 1.5, pb: 1.5 }}>
      <Box
        sx={{
          p: 1.5,
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper'
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/** Admin glanceable card: live occupancy across all properties. */
function AdminInsight() {
  const { data } = useQuery<{ getAllPgsRooms: Pg[] }>(GET_ALL_PGS_ROOMS_QUERY);
  const pgs = data?.getAllPgsRooms ?? [];
  if (pgs.length === 0) return null;

  const rooms = pgs.flatMap((pg) => pg.rooms ?? []);
  const beds = rooms.reduce((sum, room) => sum + room.capacity, 0);
  const occupied = rooms.reduce((sum, room) => sum + room.occupiedCount, 0);
  const percent = beds > 0 ? Math.round((occupied / beds) * 100) : 0;
  const tone = percent >= 100 ? 'error' : percent >= 75 ? 'warning' : 'primary';

  return (
    <InsightCard>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: '0.08em', color: 'text.secondary' }}
        >
          OCCUPANCY
        </Typography>
        <Typography variant="caption" fontWeight={600}>
          {percent}%
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(percent, 100)}
        color={tone}
        aria-label={`Occupancy ${percent} percent`}
        sx={{
          height: 4,
          borderRadius: 2,
          my: 1,
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08)
        }}
      />
      <Typography variant="caption" color="text.secondary" display="block">
        {occupied} of {beds} beds · {pgs.length}{' '}
        {pgs.length === 1 ? PROPERTY_TERM.singularLower : PROPERTY_TERM.pluralLower}
      </Typography>
      <Button
        component={RouterLink}
        to="/admin/properties"
        size="small"
        sx={{ mt: 0.75, ml: -0.5, fontSize: '0.75rem' }}
      >
        View {PROPERTY_TERM.pluralLower}
      </Button>
    </InsightCard>
  );
}

/** Tenant glanceable card: their room and rent at a glance. */
function TenantInsight() {
  const { data } = useQuery<{ getTenantPgRoom: TenantPgRoom | null }>(GET_TENANT_PG_ROOM_QUERY);
  const assignment = data?.getTenantPgRoom ?? null;
  if (!assignment?.room) return null;

  const { pg, room } = assignment;

  return (
    <InsightCard>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, letterSpacing: '0.08em', color: 'text.secondary' }}
        display="block"
      >
        MY ROOM
      </Typography>
      <Typography variant="body2" fontWeight={600} sx={{ mt: 0.75 }} noWrap>
        Room {room.roomNumber} · {pg.name}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        {formatCurrency(room.rent)}/month
      </Typography>
      <Button
        component={RouterLink}
        to="/tenant/room"
        size="small"
        sx={{ mt: 0.75, ml: -0.5, fontSize: '0.75rem' }}
      >
        View room
      </Button>
    </InsightCard>
  );
}

/** Role-appropriate live insight pinned above the user block. */
function SidebarInsight() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === 'Admin' ? <AdminInsight /> : <TenantInsight />;
}

/** Full sidebar body: brand, scrollable nav, and the pinned user identity. */
function SidebarContent({ onNavigate, onLogout }: SidebarContentProps) {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PortalBrand caption={user.role === 'Admin' ? 'Admin Portal' : 'Tenant Portal'} />
      <Divider />
      <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
        <PortalNavList onNavigate={onNavigate} />
      </Box>
      <SidebarInsight />
      <Divider />
      <Box sx={{ p: 1.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            px: 1.25,
            py: 1.25,
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper'
          }}
        >
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: 'primary.main',
              fontSize: '0.8125rem',
              fontWeight: 600
            }}
          >
            {getInitials(user.name)}
          </Avatar>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontSize: '0.8125rem', fontWeight: 600 }} noWrap>
              {user.name}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              sx={{ lineHeight: 1.4 }}
              noWrap
            >
              {user.role === 'Admin' ? 'Administrator' : 'Tenant'}
            </Typography>
          </Box>
          <Tooltip title="Log out">
            <IconButton
              aria-label="Log out"
              size="small"
              onClick={onLogout}
              sx={{
                color: 'text.secondary',
                transition: 'color 150ms ease',
                '&:hover': { color: 'error.main' }
              }}
            >
              <LogoutIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Post-login portal shell (MRD §4/§5): full-height sidebar navigation, sticky
 * top bar with the current page title and account menu, and the main content
 * area. The sidebar collapses into a temporary drawer on smaller screens
 * (MRD §10). Rendered by AppShell for portal routes only — public pages keep
 * the marketing header/footer.
 */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);

  const closeDrawer = () => setMobileOpen(false);
  const closeMenu = () => setMenuAnchor(null);

  const handleLogout = async (): Promise<void> => {
    closeMenu();
    await logout();
    navigate('/login', { replace: true });
  };

  // Route guards redirect guests; render content plainly while auth resolves.
  if (!user) {
    return (
      <Box component="main" id="main-content" sx={{ flexGrow: 1, py: { xs: 3, sm: 4 } }}>
        <Container maxWidth="xl">{loading ? null : children}</Container>
      </Box>
    );
  }

  const pageTitle = getPortalTitle(location.pathname, user.role);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Desktop sidebar */}
      <Box
        component="aside"
        aria-label="Portal sidebar"
        sx={{
          display: { xs: 'none', md: 'flex' },
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
          bgcolor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider'
        }}
      >
        <Box sx={{ width: '100%' }}>
          <SidebarContent onLogout={() => void handleLogout()} />
        </Box>
      </Box>

      {/* Mobile sidebar drawer */}
      <Drawer
        variant="temporary"
        anchor="left"
        open={mobileOpen}
        onClose={closeDrawer}
        ModalProps={{ keepMounted: true }}
        slotProps={{ paper: { sx: { width: MOBILE_DRAWER_WIDTH } } }}
        sx={{ display: { xs: 'block', md: 'none' } }}
      >
        <SidebarContent onNavigate={closeDrawer} onLogout={() => void handleLogout()} />
      </Drawer>

      {/* Content column */}
      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh'
        }}
      >
        <Box
          component="header"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: (theme) => theme.zIndex.appBar,
            bgcolor: 'background.paper',
            borderBottom: 1,
            borderColor: 'divider'
          }}
        >
          <Container maxWidth="xl">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: TOPBAR_HEIGHT }}>
              <IconButton
                aria-label="Open navigation menu"
                onClick={() => setMobileOpen(true)}
                edge="start"
                sx={{ display: { md: 'none' } }}
              >
                <MenuIcon />
              </IconButton>
              <Typography
                variant="h6"
                component="p"
                noWrap
                sx={{ flexGrow: 1, fontSize: '1rem', fontWeight: 600 }}
              >
                {pageTitle}
              </Typography>
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <SystemStatus />
              </Box>
              <Tooltip title="Account">
                <IconButton
                  aria-label="Account menu"
                  aria-haspopup="true"
                  aria-expanded={menuAnchor ? 'true' : undefined}
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                  size="small"
                  sx={{ ml: 1 }}
                >
                  <Avatar
                    sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: '0.8125rem' }}
                  >
                    {getInitials(user.name)}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={menuAnchor}
                open={menuAnchor !== null}
                onClose={closeMenu}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                <MenuItem component={RouterLink} to="/profile" onClick={closeMenu}>
                  <ListItemIcon>
                    <PersonIcon fontSize="small" />
                  </ListItemIcon>
                  Profile
                </MenuItem>
                <MenuItem onClick={() => void handleLogout()}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  Logout
                </MenuItem>
              </Menu>
            </Box>
          </Container>
        </Box>

        <Box component="main" id="main-content" sx={{ flexGrow: 1, py: { xs: 3, sm: 4 } }}>
          <Container maxWidth="xl">{children}</Container>
        </Box>
      </Box>
    </Box>
  );
}
