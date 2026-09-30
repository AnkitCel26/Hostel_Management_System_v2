import { Box, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { PieChart } from '@mui/x-charts/PieChart';

import type { PaymentStatus } from '../../types';
import { ChartFrame } from './ChartFrame';
import { DashboardSection } from './DashboardSection';

interface PaymentStatusChartProps {
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  overdueCount: number;
  loading: boolean;
  emptyState: React.ReactNode;
}

interface Slice {
  id: PaymentStatus;
  label: string;
  value: number;
  color: 'success' | 'info' | 'warning' | 'error';
}

export function PaymentStatusChart({
  paidCount,
  partialCount,
  pendingCount,
  overdueCount,
  loading,
  emptyState
}: PaymentStatusChartProps) {
  const theme = useTheme();

  const slices: Slice[] = [
    { id: 'paid', label: 'Paid', value: paidCount, color: 'success' },
    { id: 'partial', label: 'Partial', value: partialCount, color: 'info' },
    { id: 'pending', label: 'Pending', value: pendingCount, color: 'warning' },
    { id: 'overdue', label: 'Overdue', value: overdueCount, color: 'error' }
  ];
  const active = slices.filter((slice) => slice.value > 0);
  const total = active.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <DashboardSection
      title="Payment status"
      subtitle={
        total > 0
          ? `${total} payment${total === 1 ? '' : 's'} by live status`
          : 'Every recorded payment by live status'
      }
    >
      <ChartFrame height={200} isEmpty={!loading && total === 0} emptyState={emptyState}>
        <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
          <PieChart
            series={[
              {
                data: active.map((slice, index) => ({ id: String(index), value: slice.value })),
                innerRadius: 52,
                outerRadius: 88,
                paddingAngle: 2,
                cornerRadius: 4,
                highlightScope: { fade: 'global', highlight: 'item' }
              }
            ]}
            // Colors are mapped in the same order as `data`, so slice i gets
            // the palette color of the status it represents.
            colors={active.map((slice) => theme.palette[slice.color].main)}
            height={200}
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            aria-label="Rent payments by status"
          />
          {total > 0 ? (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none'
              }}
            >
              <Typography variant="h5" component="p" fontWeight={700} lineHeight={1.1}>
                {total}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {total === 1 ? 'payment' : 'payments'}
              </Typography>
            </Box>
          ) : null}
        </Box>
      </ChartFrame>

      {active.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 1,
            mt: 2
          }}
        >
          {active.map((slice) => (
            <Stack
              key={slice.id}
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ minWidth: 0 }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '3px',
                  flexShrink: 0,
                  bgcolor: theme.palette[slice.color].main
                }}
              />
              <Typography variant="caption" color="text.secondary" noWrap>
                {slice.label}
              </Typography>
              <Typography
                variant="caption"
                fontWeight={700}
                sx={{ ml: 'auto !important', pr: 0.5 }}
              >
                {slice.value}
              </Typography>
            </Stack>
          ))}
        </Box>
      ) : null}
    </DashboardSection>
  );
}
