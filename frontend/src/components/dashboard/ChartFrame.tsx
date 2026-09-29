import type { ReactNode } from 'react';
import { Box } from '@mui/material';

interface ChartFrameProps {
  /** Chart height in pixels. Charts need an explicit height to lay out. */
  height?: number;
  /** Rendered instead of the chart when there is nothing to plot. */
  isEmpty: boolean;
  emptyState: ReactNode;
  children: ReactNode;
}

/**
 * Shared frame for every dashboard chart: reserves a fixed height (so a page
 * never reflows when data arrives), and swaps in an empty state instead of
 * drawing an axis with no data. Both are required by the design system's
 * "every data-driven view handles empty state" rule.
 */
export function ChartFrame({ height = 260, isEmpty, emptyState, children }: ChartFrameProps) {
  return (
    <Box
      sx={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {isEmpty ? emptyState : children}
    </Box>
  );
}
