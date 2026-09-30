import type { ReactNode } from 'react';
import { Box, Card, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

type StatTone = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Optional extra detail shown under the value. */
  sublabel?: string;
  tone?: StatTone;
}

export function StatCard({ icon, label, value, sublabel, tone = 'primary' }: StatCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ height: '100%', p: 2.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: `${tone}.main`,
            bgcolor: (theme) => alpha(theme.palette[tone].main, 0.1)
          }}
        >
          {icon}
        </Box>
        <Box
          sx={{
            minWidth: 0,
            flexGrow: 1,
            alignSelf: 'stretch',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}
        >
          <Typography
            variant="caption"
            noWrap
            sx={{
              lineHeight: 1.5,
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'text.secondary'
            }}
          >
            {label}
          </Typography>
          <Typography
            variant="h5"
            component="p"
            fontWeight={700}
            sx={{ lineHeight: 1.25, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}
          >
            {value}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            noWrap
            sx={{ fontSize: '0.8125rem', lineHeight: 1.5, mt: 'auto', pt: 0.25 }}
          >
            {sublabel ?? '\u00A0'}
          </Typography>
        </Box>
      </Stack>
    </Card>
  );
}
