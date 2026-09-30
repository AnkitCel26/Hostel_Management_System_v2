import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

interface DetailLabelProps {
  children: ReactNode;
}

export function DetailLabel({ children }: DetailLabelProps) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      fontWeight={600}
      display="block"
      sx={{ letterSpacing: 1, textTransform: 'uppercase', lineHeight: 1.6 }}
    >
      {children}
    </Typography>
  );
}

interface DetailItemProps {
  label: string;
  value: ReactNode;
}

/** A labelled fact: uppercase label over a semibold value, aligned in a grid. */
export function DetailItem({ label, value }: DetailItemProps) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <DetailLabel>{label}</DetailLabel>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={{ lineHeight: 1.5, overflowWrap: 'anywhere' }}
      >
        {value}
      </Typography>
    </Box>
  );
}
