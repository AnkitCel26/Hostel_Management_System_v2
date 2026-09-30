import React from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Container, Link } from '@mui/material';

import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import { PortalShell } from './portal/PortalShell';
import { isPortalPath } from './portal/portalNav';

/** Keyboard-accessible skip link targeting the main landmark. */
function SkipLink() {
  return (
    <Link
      href="#main-content"
      sx={{
        position: 'absolute',
        left: 16,
        top: -64,
        zIndex: (theme) => theme.zIndex.appBar + 1,
        bgcolor: 'background.paper',
        px: 2,
        py: 1,
        borderRadius: 1,
        boxShadow: 3,
        transition: 'top 150ms ease',
        '&:focus-visible': { top: 8 }
      }}
    >
      Skip to content
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  if (isPortalPath(pathname)) {
    return (
      <>
        <SkipLink />
        <PortalShell>{children}</PortalShell>
      </>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SkipLink />
      <AppHeader />
      <Box component="main" id="main-content" sx={{ flexGrow: 1, py: { xs: 3, sm: 4 } }}>
        <Container maxWidth="lg">{children}</Container>
      </Box>
      <AppFooter />
    </Box>
  );
}
