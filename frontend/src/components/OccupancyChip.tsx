import { Chip } from '@mui/material';

interface OccupancyChipProps {
  occupied: number;
  capacity: number;
  size?: 'small' | 'medium';
}

export function OccupancyChip({ occupied, capacity, size = 'small' }: OccupancyChipProps) {
  const safeCapacity = Math.max(capacity, 0);
  const safeOccupied = Math.max(occupied, 0);

  if (safeOccupied >= safeCapacity && safeCapacity > 0) {
    return (
      <Chip
        size={size}
        color="error"
        variant="outlined"
        label={`Full · ${safeOccupied}/${safeCapacity}`}
        aria-label={`Room full: ${safeOccupied} of ${safeCapacity} beds occupied`}
      />
    );
  }
  if (safeOccupied === 0) {
    return (
      <Chip
        size={size}
        color="success"
        variant="outlined"
        label={`Vacant · 0/${safeCapacity}`}
        aria-label={`Room vacant: 0 of ${safeCapacity} beds occupied`}
      />
    );
  }
  return (
    <Chip
      size={size}
      color="warning"
      variant="outlined"
      label={`${safeOccupied}/${safeCapacity} occupied`}
      aria-label={`${safeOccupied} of ${safeCapacity} beds occupied`}
    />
  );
}
