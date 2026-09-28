import { Box, Container, Divider, Stack, Typography } from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';

import { PROPERTY_TERM } from '../utils/labels';
import { SystemStatus } from './SystemStatus';

/** Global footer: brand summary, live system status, copyright. */
export function AppFooter() {
  return (
    <Box
      component="footer"
      sx={{
        mt: 'auto',
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        py: 4
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2.5}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1.5,
                bgcolor: 'primary.main',
                color: 'common.white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <ApartmentIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>
                Hostel Management System
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Manage {PROPERTY_TERM.pluralLower}, rooms, tenants, and payments in one place.
              </Typography>
            </Box>
          </Stack>
          <SystemStatus />
        </Stack>
        <Divider sx={{ my: 2.5 }} />
        <Typography variant="caption" color="text.secondary">
          © {new Date().getFullYear()} Hostel Management System. All rights reserved.
        </Typography>
      </Container>
    </Box>
  );
}
