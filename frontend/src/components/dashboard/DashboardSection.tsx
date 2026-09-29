import type { ReactNode } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';

interface DashboardSectionProps {
  title: string;
  /** Short supporting line under the title. */
  subtitle?: string;
  /** Optional right-aligned control (a link, filter, or legend). */
  action?: ReactNode;
  children: ReactNode;
  /** Removes the body padding, for panels that host a full-bleed table. */
  disablePadding?: boolean;
}

/**
 * Titled panel used for every dashboard block (charts, recent activity, quick
 * links). One panel frame keeps the dashboards visually consistent with the
 * management pages, which use the same Card border/radius from the theme.
 */
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
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          px: 2.5,
          py: 2,
          borderBottom: 1,
          borderColor: 'divider'
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
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
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {children}
      </CardContent>
    </Card>
  );
}
