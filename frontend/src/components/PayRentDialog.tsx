import React from 'react';
import { useMutation } from '@apollo/client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography
} from '@mui/material';

import { PaymentStatusChip } from './PaymentStatusChip';
import { PAY_RENT_MUTATION } from '../graphql/operations';
import type { RentPayment } from '../types';
import { getGraphQLErrorMessage } from '../utils/errors';
import { formatCurrency, formatDateOnly } from '../utils/format';

const AMOUNT_MAX = 10_000_000;

interface PayRentDialogProps {
  open: boolean;
  payment: RentPayment | null;
  onClose: () => void;
  onPaid: (message: string) => void;
}

export function PayRentDialog({ open, payment, onClose, onPaid }: PayRentDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const remaining = payment !== null ? Math.max(payment.amount - payment.paidAmount, 0) : 0;

  const payRentSchema = z
    .object({
      amount: z
        .number({ invalid_type_error: 'Enter the amount to pay' })
        .int('Amount must be a whole number')
        .min(1, 'Amount must be at least 1')
        .max(AMOUNT_MAX, `Amount must be ${AMOUNT_MAX.toLocaleString()} or less`)
    })
    .superRefine((data, ctx) => {
      if (data.amount > remaining) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Payment amount cannot exceed the remaining ${formatCurrency(remaining)}`,
          path: ['amount']
        });
      }
    });

  type PayRentFormData = z.infer<typeof payRentSchema>;

  const [payRent] = useMutation(PAY_RENT_MUTATION);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<PayRentFormData>({
      resolver: zodResolver(payRentSchema),
      defaultValues: { amount: remaining }
    });

  React.useEffect(() => {
    if (open) {
      setServerError(null);
      reset({ amount: remaining });
    }
    // The payment (and its remaining rent) is fixed while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment, reset]);

  const onSubmit = async (data: PayRentFormData): Promise<void> => {
    if (payment === null) return;
    setServerError(null);
    try {
      await payRent({
        variables: {
          input: {
            paymentId: payment.id,
            amount: data.amount
          }
        }
      });
      const fullyPaid = payment.paidAmount + data.amount >= payment.amount;
      onPaid(
        fullyPaid
          ? `Payment of ${formatCurrency(data.amount)} recorded. This month's rent is fully paid.`
          : `Payment of ${formatCurrency(data.amount)} recorded. ${formatCurrency(
              payment.amount - payment.paidAmount - data.amount
            )} remaining.`
      );
    } catch (error) {
      setServerError(
        getGraphQLErrorMessage(error, 'Unable to record the payment. Please try again.')
      );
    }
  };

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Pay rent</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit(onSubmit)} noValidate spacing={0}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {serverError ? (
              <Alert severity="error" role="alert">
                {serverError}
              </Alert>
            ) : null}

            {payment !== null ? (
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  bgcolor: 'background.default',
                  border: 1,
                  borderColor: 'divider'
                }}
              >
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  justifyContent="space-between"
                  flexWrap="wrap"
                  useFlexGap
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      Rent due {formatDateOnly(payment.dueDate)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatCurrency(payment.amount)} rent ·{' '}
                      {formatCurrency(payment.paidAmount)} paid ·{' '}
                      {formatCurrency(remaining)} remaining
                    </Typography>
                  </Box>
                  <PaymentStatusChip status={payment.status} />
                </Stack>
              </Box>
            ) : null}

            <TextField
              label="Amount to pay"
              required
              type="number"
              autoFocus
              error={!!errors.amount}
              helperText={
                errors.amount?.message ??
                `Pay any amount up to the remaining ${formatCurrency(remaining)}`
              }
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              inputProps={{ min: 1, max: remaining, step: 1 }}
              {...register('amount', { valueAsNumber: true })}
            />

            <Typography variant="caption" color="text.secondary">
              You can pay in parts — once the full rent is paid, this month is marked paid
              automatically.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Recording…' : 'Make payment'}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
