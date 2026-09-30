import { Chip } from '@mui/material';

import type { PaymentStatus } from '../types';

interface PaymentStatusPresentation {
  label: string;
  color: 'success' | 'info' | 'warning' | 'error';
}

const STATUS_PRESENTATION: Record<PaymentStatus, PaymentStatusPresentation> = {
  paid: { label: 'Paid', color: 'success' },
  partial: { label: 'Partial', color: 'info' },
  pending: { label: 'Pending', color: 'warning' },
  overdue: { label: 'Overdue', color: 'error' }
};

interface PaymentStatusChipProps {
  status: PaymentStatus;
  size?: 'small' | 'medium';
}

/** Consistent rent payment status indicator (design system §9). */
export function PaymentStatusChip({ status, size = 'small' }: PaymentStatusChipProps) {
  const presentation = STATUS_PRESENTATION[status];
  return (
    <Chip
      size={size}
      color={presentation.color}
      variant="outlined"
      label={presentation.label}
      aria-label={`Payment status: ${presentation.label}`}
    />
  );
}
