import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Card, Link, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import { ProductPreview } from './ProductPreview';

const PANEL_POINTS = [
  'Rooms, tenants, and rent payments in one dashboard',
  'Complaints and announcements without the chaos',
  'Separate, focused portals for admins and tenants'
];

interface AuthLayoutProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  footerText: string;
  footerLinkLabel: string;
  footerLinkTo: string;
  children: ReactNode;
}

export function AuthLayout({
  icon,
  title,
  subtitle,
  footerText,
  footerLinkLabel,
  footerLinkTo,
  children
}: AuthLayoutProps) {
  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', py: { xs: 2, sm: 4 } }}>
      <Card sx={{ overflow: 'hidden' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { md: '1fr 1.05fr' },
            minHeight: { md: 660 }
          }}
        >
          {/* Brand panel — desktop only */}
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              flexDirection: 'column',
              position: 'relative',
              p: 5,
              color: 'common.white',
              background: 'linear-gradient(160deg, #1976D2 0%, #1256A0 100%)'
            }}
          >
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.14) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
                opacity: 0.5,
                pointerEvents: 'none'
              }}
            />
            <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: 'common.white',
                    color: 'primary.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <ApartmentIcon fontSize="small" />
                </Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  Hostel Management System
                </Typography>
              </Stack>

              <Typography
                variant="h4"
                component="p"
                sx={{ mt: 5, maxWidth: 400, letterSpacing: '-0.01em' }}
              >
                Run your entire hostel operation in one place
              </Typography>

              <Stack spacing={1.5} sx={{ mt: 3 }}>
                {PANEL_POINTS.map((point) => (
                  <Stack key={point} direction="row" spacing={1.25} alignItems="center">
                    <CheckCircleOutlineIcon fontSize="small" sx={{ opacity: 0.9 }} />
                    <Typography variant="body2" sx={{ opacity: 0.92 }}>
                      {point}
                    </Typography>
                  </Stack>
                ))}
              </Stack>

              <Box sx={{ mt: 'auto', pt: 5 }}>
                <ProductPreview />
              </Box>
            </Box>
          </Box>

          {/* Form column */}
          <Box
            sx={{
              p: { xs: 3, sm: 4, md: 5 },
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2.5,
                mb: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.main',
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1)
              }}
            >
              {icon}
            </Box>
            <Typography variant="h4" component="h1">
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>
              {subtitle}
            </Typography>

            {children}

            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              {footerText}{' '}
              <Link component={RouterLink} to={footerLinkTo} underline="hover" fontWeight={600}>
                {footerLinkLabel}
              </Link>
            </Typography>
          </Box>
        </Box>
      </Card>
    </Box>
  );
}
