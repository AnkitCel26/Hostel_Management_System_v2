import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  /** Optional call-to-action rendered below the message. */
  action?: ReactNode;
}

/**
 * Consistent empty state for data-driven pages (UI/UX design system §11):
 * tinted icon badge, title, supporting message, and an optional action.
 */
export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        py: { xs: 6, sm: 8 },
        px: 3
      }}
    >
      {icon ? (
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 2,
            color: 'primary.main',
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1)
          }}
        >
          {icon}
        </Box>
      ) : null}
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      {message ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {message}
        </Typography>
      ) : null}
      {action ? <Box sx={{ mt: 3 }}>{action}</Box> : null}
    </Box>
  );
}
