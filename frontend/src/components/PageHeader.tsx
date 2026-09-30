import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional right-aligned action (usually the primary page button). */
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { sm: 'flex-start' },
        justifyContent: 'space-between',
        gap: 2,
        mb: 3
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Box>
  );
}
