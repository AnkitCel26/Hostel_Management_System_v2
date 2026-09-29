/* TEMPORARY visual-check harness — deleted after screenshots. */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MockedProvider } from '@apollo/client/testing';
import { Box, Container } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';

import { PortalShell } from '../components/portal/PortalShell';
import { SnackbarProvider } from '../context/SnackbarContext';
import { AuthProvider } from '../context/AuthContext';
import { GET_ALL_PGS_ROOMS_QUERY, ME_QUERY } from '../graphql/operations';
import { AdminPgPage } from '../pages/admin/AdminPgPage';
import { HomePage } from '../pages/HomePage';
import { theme } from '../theme';

const room = (
  n: number,
  roomNumber: string,
  roomType: string | null,
  capacity: number,
  occupiedCount: number,
  rent: number,
  floor: number | null
) => ({
  __typename: 'Room',
  id: `r-${n}`,
  roomNumber,
  roomType,
  capacity,
  occupiedCount,
  rent,
  floor,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
});

const bigProperty = {
  __typename: 'Pg',
  id: 'pg-4',
  name: "Lakeview Women's Residency",
  address: '14th Cross, Indiranagar, near Metro Station',
  city: 'Bengaluru',
  contactNumber: '+91 98450 11223',
  description:
    "Premium women's residency with attached kitchens, 24x7 warden support, Wi-Fi, housekeeping twice a week and a fully furnished common lounge.",
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  rooms: [
    room(11, 'A-101', 'AC Sharing', 3, 3, 7500, 1),
    room(12, 'A-102', 'AC Sharing', 3, 2, 7500, 1),
    room(13, 'A-103', 'AC Sharing', 2, 1, 7800, 1),
    room(14, 'B-201', 'AC Private', 1, 0, 12000, 2),
    room(15, 'B-202', 'AC Private', 1, 1, 12000, 2),
    room(16, 'B-203', 'Non-AC Sharing', 4, 2, 5200, 2),
    room(17, 'B-204', 'Non-AC Sharing', 4, 4, 5200, 2),
    room(18, 'C-301', 'AC Private', 1, 0, 12500, 3)
  ]
};

const PGS = {
  getAllPgsRooms: [
    {
      __typename: 'Pg',
      id: 'pg-1',
      name: 'Green Valley Residency',
      address: '221, 5th Block, Koramangala',
      city: 'Bengaluru',
      contactNumber: '+91 98860 55123',
      description: 'Quiet residential block close to the ring road, with a terrace and laundry service.',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      rooms: [
        room(1, 'G-01', 'AC Sharing', 3, 3, 6800, 1),
        room(2, 'G-02', 'AC Sharing', 3, 1, 6800, 1),
        room(3, 'G-03', 'Non-AC Sharing', 4, 0, 4500, 2),
        room(4, 'G-04', 'AC Private', 1, 1, 11000, 2)
      ]
    },
    {
      __typename: 'Pg',
      id: 'pg-2',
      name: 'Sunrise PG',
      address: 'Plot 9, Viman Nagar',
      city: 'Pune',
      contactNumber: '+91 98220 77451',
      description: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      rooms: [room(5, 'S-101', 'Non-AC Sharing', 4, 2, 4800, 1)]
    },
    {
      __typename: 'Pg',
      id: 'pg-3',
      name: 'Riverside Co-living',
      address: 'Sector 21, opposite Green Park',
      city: 'Bengaluru',
      contactNumber: null,
      description: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      rooms: []
    },
    bigProperty
  ]
};

const adminUser = {
  __typename: 'User',
  id: 'u-1',
  name: 'Portal Admin',
  email: 'admin@hostel.test',
  role: 'Admin'
};

const view = new URLSearchParams(window.location.search).get('view') ?? 'pg';

function PgView() {
  return (
    <MockedProvider
      mocks={[
        { request: { query: ME_QUERY }, result: { data: { me: adminUser } } },
        { request: { query: GET_ALL_PGS_ROOMS_QUERY }, result: { data: PGS } }
      ]}
      addTypename={false}
    >
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MemoryRouter>
          <SnackbarProvider>
            <AuthProvider>
              <PortalShell>
                <AdminPgPage />
              </PortalShell>
            </AuthProvider>
          </SnackbarProvider>
        </MemoryRouter>
      </ThemeProvider>
    </MockedProvider>
  );
}

function HomeView() {
  return (
    <MockedProvider
      mocks={[{ request: { query: ME_QUERY }, result: { data: { me: null } } }]}
      addTypename={false}
    >
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MemoryRouter>
          <SnackbarProvider>
            <AuthProvider>
              <HomePage />
            </AuthProvider>
          </SnackbarProvider>
        </MemoryRouter>
      </ThemeProvider>
    </MockedProvider>
  );
}

function EmptyView() {
  return (
    <MockedProvider
      mocks={[
        { request: { query: ME_QUERY }, result: { data: { me: adminUser } } },
        { request: { query: GET_ALL_PGS_ROOMS_QUERY }, result: { data: { getAllPgsRooms: [] } } }
      ]}
      addTypename={false}
    >
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MemoryRouter>
          <SnackbarProvider>
            <AuthProvider>
              <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', py: 4 }}>
                <Container maxWidth="xl">
                  <AdminPgPage />
                </Container>
              </Box>
            </AuthProvider>
          </SnackbarProvider>
        </MemoryRouter>
      </ThemeProvider>
    </MockedProvider>
  );
}

function App() {
  if (view === 'audit') return <PgView />;
  if (view === 'audit-empty') return <EmptyView />;
  if (view === 'audit-loading') return <LoadingView />;
  if (view === 'home') return <HomeView />;
  if (view === 'empty') return <EmptyView />;
  return <PgView />;
}

function LoadingView() {
  return (
    <MockedProvider mocks={[]} addTypename={false}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MemoryRouter>
          <SnackbarProvider>
            <AuthProvider>
              <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', py: 4 }}>
                <Container maxWidth="xl">
                  <AdminPgPage />
                </Container>
              </Box>
            </AuthProvider>
          </SnackbarProvider>
        </MemoryRouter>
      </ThemeProvider>
    </MockedProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/* TEMPORARY layout audit — reports overflow/truncation metrics into the DOM. */
if (view.startsWith('audit') || view === 'home') {
  const report: string[] = [];
  const push = (line: string) => report.push(line);
  setTimeout(() => {
    const vw = window.innerWidth;
    push(`viewport ${vw}x${window.innerHeight}`);
    push(`doc scrollWidth ${document.documentElement.scrollWidth} (overflow=${document.documentElement.scrollWidth > vw})`);

    const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const overflowing = all.filter(
      (el) =>
        el.scrollWidth > el.clientWidth + 1 &&
        el.clientWidth > 0 &&
        getComputedStyle(el).overflowX !== 'auto' &&
        getComputedStyle(el).overflowX !== 'scroll'
    );
    push(`horizontal overflow elements: ${overflowing.length}`);
    overflowing.slice(0, 8).forEach((el) =>
      push(`  <${el.tagName.toLowerCase()} class="${el.className}"> "${(el.textContent ?? '').slice(0, 40).replace(/\s+/g, ' ')}" sw=${el.scrollWidth} cw=${el.clientWidth}`)
    );

    const headings = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3'));
    push(`headings: ${headings.map((h) => `${h.tagName}:"${(h.textContent ?? '').trim().slice(0, 28)}"`).join(' | ')}`);

    const buttons = Array.from(document.querySelectorAll<HTMLElement>('button,a.MuiButton-root'));
    push(`actions: ${buttons.map((b) => `"${(b.textContent ?? '').trim()}"`).join(' | ')}`);

    const roomTiles = all.filter((el) => /^A-101$|^S-101$|^G-01$/.test((el.textContent ?? '').trim()) );
    push(`room tiles found: ${roomTiles.length}`);

    const more = Array.from(document.querySelectorAll<HTMLElement>('a.MuiButton-root')).filter((a) =>
      (a.textContent ?? '').includes('more room')
    );
    push(`more-rooms link: ${more.length ? `"${(more[0].textContent ?? '').trim()}"` : 'none'}`);

    const pre = document.createElement('pre');
    pre.id = 'audit-report';
    pre.textContent = `\n===AUDIT===\n${report.join('\n')}\n===END===\n`;
    document.body.appendChild(pre);
  }, 2500);
}
