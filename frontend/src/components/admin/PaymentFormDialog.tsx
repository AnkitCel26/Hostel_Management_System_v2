import React from 'react';
import { useMutation } from '@apollo/client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  InputAdornment, MenuItem, Stack, TextField, Typography
} from '@mui/material';

import {
  CREATE_RENT_PAYMENT_MUTATION,
  UPDATE_RENT_PAYMENT_MUTATION
} from '../../graphql/operations';
import type { RentPayment, Tenant } from '../../types';
import { getGraphQLErrorMessage } from '../../utils/errors';
import { PaymentStatusChip } from '../PaymentStatusChip';

// Limits mirror the backend payment service validation (payment.service.ts).
const paymentSchema = z
  .object({
    tenantId: z.string().min(1, 'Select a tenant'),
    amount: z.number({ invalid_type_error: 'Amount is required' })
      .int('Amount must be a whole number')
      .min(1, 'Amount must be at least 1')
      .max(10_000_000, 'Amount must be 10,000,000 or less'),
    // Optional: an empty field arrives as NaN and is treated as "not set"
    paidAmount: z.union([
      z.nan(),
      z.number().int('Paid amount must be a whole number')
        .min(0, 'Paid amount cannot be negative')
        .max(10_000_000, 'Paid amount must be 10,000,000 or less')
    ]).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid due date'),
    paidDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Enter a valid paid date'),
    notes: z.string().trim().max(2000, 'Notes must be 2,000 characters or fewer')
  })
  .superRefine((data, ctx) => {
    const paidAmount =
      typeof data.paidAmount === 'number' && !Number.isNaN(data.paidAmount)
        ? data.paidAmount
        : undefined;
    if (paidAmount !== undefined && paidAmount > data.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Paid amount cannot exceed the rent amount',
        path: ['paidAmount']
      });
    }
    if (data.paidDate !== '' && paidAmount !== undefined && paidAmount < data.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A paid date only applies while the payment is fully paid',
        path: ['paidDate']
      });
    }
  });

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentFormDialogProps {
  open: boolean;
  payment: RentPayment | null;
  tenants: Tenant[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function PaymentFormDialog({ open, payment, tenants, onClose, onSaved }: PaymentFormDialogProps) {
  const isEdit = payment !== null;
  const [serverError, setServerError] = React.useState<string | null>(null);

  const [createRentPayment] = useMutation(CREATE_RENT_PAYMENT_MUTATION);
  const [updateRentPayment] = useMutation(UPDATE_RENT_PAYMENT_MUTATION);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<PaymentFormData>({
      resolver: zodResolver(paymentSchema),
      defaultValues: {
        tenantId: '',
        paidAmount: 0,
        dueDate: '',
        paidDate: '',
        notes: ''
      }
    });

  React.useEffect(() => {
    if (open) {
      setServerError(null);
      reset({
        tenantId: payment?.tenant?.id ?? '',
        amount: payment?.amount ?? undefined,
        paidAmount: payment?.paidAmount ?? 0,
        dueDate: payment?.dueDate ?? '',
        paidDate: payment?.paidDate ?? '',
        notes: payment?.notes ?? ''
      });
    }
  }, [open, payment, reset]);

  const onSubmit = async (data: PaymentFormData): Promise<void> => {
    setServerError(null);
    const paidAmount =
      typeof data.paidAmount === 'number' && !Number.isNaN(data.paidAmount)
        ? data.paidAmount
        : undefined;
    const tenantName = isEdit
      ? payment.tenant?.name ?? 'tenant'
      : tenants.find((tenant) => tenant.id === data.tenantId)?.name ?? 'tenant';
    try {
      if (isEdit) {
        await updateRentPayment({
          variables: {
            id: payment.id,
            input: {
              amount: data.amount,
              paidAmount,
              dueDate: data.dueDate,
              paidDate: data.paidDate,
              notes: data.notes
            }
          }
        });
        onSaved(`Payment for ${tenantName} updated.`);
      } else {
        await createRentPayment({
          variables: {
            input: {
              tenantId: data.tenantId,
              amount: data.amount,
              paidAmount,
              dueDate: data.dueDate,
              paidDate: data.paidDate === '' ? undefined : data.paidDate,
              notes: data.notes === '' ? undefined : data.notes
            }
          }
        });
        onSaved(`Payment recorded for ${tenantName}.`);
      }
    } catch (error) {
      setServerError(getGraphQLErrorMessage(error, 'Unable to save the payment. Please try again.'));
    }
  };

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Edit payment' : 'Record payment'}</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit(onSubmit)} noValidate spacing={0}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {serverError ? <Alert severity="error" role="alert">{serverError}</Alert> : null}
            {!isEdit && tenants.length === 0 ? (
              <Alert severity="info">
                No tenant records exist yet. Create a tenant first, then record payments for them.
              </Alert>
            ) : null}
            {isEdit ? (
              <>
                <TextField
                  label="Tenant"
                  value={payment.tenant?.name ?? ''}
                  InputProps={{ readOnly: true }}
                  helperText="Payments cannot be moved between tenants."
                />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Current status:
                  </Typography>
                  <PaymentStatusChip status={payment.status} />
                </Box>
              </>
            ) : (
              <TextField
                select
                label="Tenant"
                required
                error={!!errors.tenantId}
                helperText={errors.tenantId?.message ?? 'The tenant this rent payment belongs to'}
                inputProps={{ 'aria-label': 'Select a tenant' }}
                {...register('tenantId')}
              >
                {tenants.map((tenant) => (
                  <MenuItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                    {tenant.pg?.name ? ` · ${tenant.pg.name}` : ''}
                    {tenant.room ? ` · Room ${tenant.room.roomNumber}` : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Rent amount"
                required
                type="number"
                autoFocus
                error={!!errors.amount}
                helperText={errors.amount?.message ?? 'Total rent due for this period'}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                inputProps={{ min: 1, max: 10_000_000, step: 1 }}
                {...register('amount', { valueAsNumber: true })}
              />
              <TextField
                label="Amount paid"
                type="number"
                error={!!errors.paidAmount}
                helperText={
                  errors.paidAmount?.message ??
                  (isEdit ? 'Leave blank to keep the current value' : 'Leave blank for 0')
                }
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                inputProps={{ min: 0, max: 10_000_000, step: 1 }}
                {...register('paidAmount', { valueAsNumber: true })}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Due date"
                required
                type="date"
                error={!!errors.dueDate}
                helperText={errors.dueDate?.message}
                InputLabelProps={{ shrink: true }}
                {...register('dueDate')}
              />
              <TextField
                label="Paid date"
                type="date"
                error={!!errors.paidDate}
                helperText={errors.paidDate?.message ??
                  'Optional — only kept while fully paid; defaults to today'}
                InputLabelProps={{ shrink: true }}
                {...register('paidDate')}
              />
            </Stack>
            <TextField
              label="Notes"
              multiline
              minRows={2}
              error={!!errors.notes}
              helperText={errors.notes?.message ?? 'Optional — e.g. payment method or reference'}
              inputProps={{ maxLength: 2000 }}
              {...register('notes')}
            />
            <Typography variant="caption" color="text.secondary">
              Status is derived automatically from the paid amount and the due date.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || (!isEdit && tenants.length === 0)}
          >
            {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Record payment'}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
