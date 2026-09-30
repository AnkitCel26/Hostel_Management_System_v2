import type { ReactNode } from 'react';
import { Box } from '@mui/material';

interface ChartFrameProps {
  /** Chart height in pixels. Charts need an explicit height to lay out. */
  height?: number;
  isEmpty: boolean;
  emptyState: ReactNode;
  children: ReactNode;
}

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
