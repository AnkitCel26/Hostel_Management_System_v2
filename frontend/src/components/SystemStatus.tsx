import { useQuery } from '@apollo/client';
import { Box, Typography } from '@mui/material';

import { HEALTH_QUERY } from '../graphql/operations';

type StatusTone = 'loading' | 'operational' | 'error';

const STATUS_META: Record<StatusTone, { color: string; label: string }> = {
  loading: { color: 'text.disabled', label: 'Checking system status…' },
  operational: { color: 'success.main', label: 'All systems operational' },
  error: { color: 'error.main', label: 'Service unavailable' }
};

/** Live backend health indicator (uses the existing `health` query). */
export function SystemStatus() {
  const { data, loading, error } = useQuery(HEALTH_QUERY);

  const tone: StatusTone = error ? 'error' : loading || !data?.health ? 'loading' : 'operational';
  const meta = STATUS_META[tone];

  return (
    <Box
      component="span"
      role="status"
      aria-live="polite"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: meta.color, flexShrink: 0 }}
      />
      <Typography variant="body2" color="text.secondary">
        {meta.label}
      </Typography>
    </Box>
  );
}
