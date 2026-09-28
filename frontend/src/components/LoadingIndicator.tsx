import { Box, CircularProgress } from '@mui/material';

interface LoadingIndicatorProps {
  label?: string;
}

/** Consistent loading state for data-driven pages (UI/UX design system). */
export function LoadingIndicator({ label = 'Loading…' }: LoadingIndicatorProps) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }} role="status" aria-live="polite">
      <CircularProgress aria-label={label} />
    </Box>
  );
}
