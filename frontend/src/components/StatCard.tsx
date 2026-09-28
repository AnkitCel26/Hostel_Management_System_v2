import type { ReactNode } from 'react';
import { Box, Card, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

type StatTone = 'primary' | 'secondary' | 'success' | 'warning' | 'error';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Optional extra detail shown under the label. */
  sublabel?: string;
  tone?: StatTone;
}

/**
 * Summary statistic card: tinted icon badge beside a bold value and muted
 * label. Used for page-level summary rows (management pages, dashboards) and
 * styled to match the homepage's tinted icon-badge language.
 */
export function StatCard({ icon, label, value, sublabel, tone = 'primary' }: StatCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
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
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="p" fontWeight={700} lineHeight={1.2}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" noWrap>
            {label}
          </Typography>
          {sublabel ? (
            <Typography variant="caption" color="text.secondary" display="block" noWrap>
              {sublabel}
            </Typography>
          ) : null}
        </Box>
      </Box>
    </Card>
  );
}
