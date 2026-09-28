import type { ReactNode } from 'react';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CampaignIcon from '@mui/icons-material/Campaign';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DescriptionIcon from '@mui/icons-material/Description';
import HomeIcon from '@mui/icons-material/Home';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import PaymentsIcon from '@mui/icons-material/Payments';
import PeopleIcon from '@mui/icons-material/People';
import PersonIcon from '@mui/icons-material/Person';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';

import type { UserRole } from '../../types';
import { PROPERTY_TERM } from '../../utils/labels';

export interface PortalNavItem {
  label: string;
  to: string;
  icon: ReactNode;
}

export interface PortalNavSection {
  label: string;
  items: PortalNavItem[];
}

/** Admin portal menu (MRD §4 Admin Layout, plus a General section). */
const ADMIN_NAV: PortalNavSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/admin/dashboard', icon: <DashboardIcon /> }]
  },
  {
    label: 'Management',
    items: [
      { label: `${PROPERTY_TERM.singular} Management`, to: '/admin/properties', icon: <ApartmentIcon /> },
      { label: 'Room Management', to: '/admin/rooms', icon: <MeetingRoomIcon /> },
      { label: 'Tenant Management', to: '/admin/tenants', icon: <PeopleIcon /> },
      { label: 'Payments', to: '/admin/payments', icon: <PaymentsIcon /> },
      { label: 'Complaints', to: '/admin/complaints', icon: <ReportProblemIcon /> },
      { label: 'Announcements', to: '/admin/announcements', icon: <CampaignIcon /> }
    ]
  },
  {
    label: 'General',
    items: [
      { label: 'Profile', to: '/profile', icon: <PersonIcon /> },
      { label: 'Back to website', to: '/', icon: <HomeIcon /> }
    ]
  }
];

/** Tenant portal menu (MRD §5 Tenant Layout, plus a General section). */
const TENANT_NAV: PortalNavSection[] = [
  {
    label: 'Menu',
    items: [
      { label: 'Dashboard', to: '/tenant/dashboard', icon: <DashboardIcon /> },
      { label: 'My Room', to: '/tenant/room', icon: <MeetingRoomIcon /> },
      { label: 'Payments', to: '/tenant/payments', icon: <PaymentsIcon /> },
      { label: 'Complaints', to: '/tenant/complaints', icon: <ReportProblemIcon /> },
      { label: 'Announcements', to: '/tenant/announcements', icon: <CampaignIcon /> },
      { label: 'Documents', to: '/tenant/documents', icon: <DescriptionIcon /> }
    ]
  },
  {
    label: 'General',
    items: [
      { label: 'Profile', to: '/profile', icon: <PersonIcon /> },
      { label: 'Back to website', to: '/', icon: <HomeIcon /> }
    ]
  }
];

/** Navigation sections for the signed-in user's portal. */
export function getPortalNav(role: UserRole): PortalNavSection[] {
  return role === 'Admin' ? ADMIN_NAV : TENANT_NAV;
}

/**
 * Routes that use the portal (post-login) shell instead of the public
 * marketing chrome.
 */
export function isPortalPath(pathname: string): boolean {
  return (
    pathname === '/profile' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/tenant/')
  );
}

/** Current page title shown in the portal top bar. */
export function getPortalTitle(pathname: string, role: UserRole): string {
  if (pathname === '/profile') return 'Profile';
  const items = getPortalNav(role).flatMap((section) => section.items);
  const match = items.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`)
  );
  return match?.label ?? (role === 'Admin' ? 'Admin Portal' : 'Tenant Portal');
}
