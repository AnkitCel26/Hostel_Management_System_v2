import type { ReactNode } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';

interface DashboardSectionProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  disablePadding?: boolean;
}

export function DashboardSection({
  title,
  subtitle,
  action,
  children,
  disablePadding = false
}: DashboardSectionProps) {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          display: 'flex',
          // Centred, not top-aligned: the action button sits on the title's
          // optical centre, which is what makes a row of panels look aligned.
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          px: 2.5,
          py: 2,
          minHeight: 64,
          borderBottom: 1,
          borderColor: 'divider'
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography
              variant="body2"
              color="text.secondary"
              display="block"
              sx={{ mt: 0.25, fontSize: '0.8125rem', lineHeight: 1.45 }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
      </Box>
      <CardContent
        sx={{
          p: disablePadding ? 0 : 2.5,
          '&:last-child': { pb: disablePadding ? 0 : 2.5 },
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {children}
      </CardContent>
    </Card>
  );
}
