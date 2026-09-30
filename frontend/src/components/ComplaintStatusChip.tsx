import { Chip } from '@mui/material';

import type { ComplaintStatus } from '../types';

interface ComplaintStatusPresentation {
  label: string;
  color: 'success' | 'info' | 'warning' | 'error';
}

const STATUS_PRESENTATION: Record<ComplaintStatus, ComplaintStatusPresentation> = {
  open: { label: 'Open', color: 'warning' },
  in_progress: { label: 'In Progress', color: 'info' },
  resolved: { label: 'Resolved', color: 'success' }
};

/** Human-readable status label, reused by dialogs and screen-reader text. */
export function complaintStatusLabel(status: ComplaintStatus): string {
  return STATUS_PRESENTATION[status].label;
}

interface ComplaintStatusChipProps {
  status: ComplaintStatus;
  size?: 'small' | 'medium';
}

/** Consistent complaint status indicator (design system §9). */
export function ComplaintStatusChip({ status, size = 'small' }: ComplaintStatusChipProps) {
  const presentation = STATUS_PRESENTATION[status];
  return (
    <Chip
      size={size}
      color={presentation.color}
      variant="outlined"
      label={presentation.label}
      aria-label={`Complaint status: ${presentation.label}`}
    />
  );
}
