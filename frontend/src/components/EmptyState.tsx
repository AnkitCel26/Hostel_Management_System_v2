import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  /** Optional call-to-action rendered below the message. */
  action?: ReactNode;
  /**
   * Tightens the vertical padding for an empty state that lives inside a
   * dashboard panel, where the full-size version would make the panel taller
   * than its neighbours in the same row.
   */
  compact?: boolean;
}

/**
 * Consistent empty state for data-driven pages (UI/UX design system §11):
 * tinted icon badge, title, supporting message, and an optional action.
 */
export function EmptyState({ icon, title, message, action, compact = false }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        flexGrow: 1,
        justifyContent: 'center',
        py: compact ? 3.5 : { xs: 6, sm: 8 },
        px: 3
      }}
    >
      {icon ? (
        <Box
          sx={{
            width: compact ? 48 : 56,
            height: compact ? 48 : 56,
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: compact ? 1.5 : 2,
            color: 'primary.main',
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1)
          }}
        >
          {icon}
        </Box>
      ) : null}
      <Typography
        variant={compact ? 'subtitle1' : 'h6'}
        component={compact ? 'h3' : 'h2'}
        fontWeight={600}
        sx={compact ? { mb: 0.5 } : { mb: 1 }}
      >
        {title}
      </Typography>
      {message ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {message}
        </Typography>
      ) : null}
      {action ? <Box sx={{ mt: compact ? 2 : 3 }}>{action}</Box> : null}
    </Box>
  );
}
