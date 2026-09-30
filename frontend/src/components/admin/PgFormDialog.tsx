import React from 'react';
import { useMutation } from '@apollo/client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField
} from '@mui/material';

import { CREATE_PG_MUTATION, UPDATE_PG_MUTATION } from '../../graphql/operations';
import type { Pg } from '../../types';
import { getGraphQLErrorMessage } from '../../utils/errors';
import { PROPERTY_TERM } from '../../utils/labels';

// Limits mirror the backend PG service validation (pg.service.ts).
const pgSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Name must be 120 characters or fewer'),
  address: z
    .string()
    .trim()
    .min(1, 'Address is required')
    .max(255, 'Address must be 255 characters or fewer'),
  city: z.string().trim().max(80, 'City must be 80 characters or fewer'),
  contactNumber: z.string().trim().max(20, 'Contact number must be 20 characters or fewer'),
  description: z.string().trim().max(2000, 'Description must be 2000 characters or fewer')
});

type PgFormData = z.infer<typeof pgSchema>;

interface PgFormDialogProps {
  open: boolean;
  pg: Pg | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function PgFormDialog({ open, pg, onClose, onSaved }: PgFormDialogProps) {
  const isEdit = pg !== null;
  const [serverError, setServerError] = React.useState<string | null>(null);

  const [createPg] = useMutation(CREATE_PG_MUTATION);
  const [updatePg] = useMutation(UPDATE_PG_MUTATION);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<PgFormData>({
    resolver: zodResolver(pgSchema),
    defaultValues: { name: '', address: '', city: '', contactNumber: '', description: '' }
  });

  React.useEffect(() => {
    if (open) {
      setServerError(null);
      reset({
        name: pg?.name ?? '',
        address: pg?.address ?? '',
        city: pg?.city ?? '',
        contactNumber: pg?.contactNumber ?? '',
        description: pg?.description ?? ''
      });
    }
  }, [open, pg, reset]);

  const onSubmit = async (data: PgFormData): Promise<void> => {
    setServerError(null);
    const input = {
      name: data.name,
      address: data.address,
      city: data.city,
      contactNumber: data.contactNumber,
      description: data.description
    };
    try {
      if (isEdit) {
        await updatePg({ variables: { id: pg.id, input } });
        onSaved(`${PROPERTY_TERM.singular} "${data.name}" updated.`);
      } else {
        await createPg({ variables: { input } });
        onSaved(`${PROPERTY_TERM.singular} "${data.name}" created.`);
      }
    } catch (error) {
      setServerError(
        getGraphQLErrorMessage(
          error,
          `Unable to save the ${PROPERTY_TERM.singularLower}. Please try again.`
        )
      );
    }
  };

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {isEdit ? `Edit ${PROPERTY_TERM.singular}` : `Add ${PROPERTY_TERM.singular}`}
      </DialogTitle>
      <Stack component="form" onSubmit={handleSubmit(onSubmit)} noValidate spacing={0}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {serverError ? (
              <Alert severity="error" role="alert">
                {serverError}
              </Alert>
            ) : null}

            <TextField
              label={`${PROPERTY_TERM.singular} name`}
              required
              autoFocus
              error={!!errors.name}
              helperText={errors.name?.message}
              {...register('name')}
            />

            <TextField
              label="Address"
              required
              multiline
              minRows={2}
              error={!!errors.address}
              helperText={errors.address?.message}
              {...register('address')}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="City"
                error={!!errors.city}
                helperText={errors.city?.message ?? 'Optional'}
                {...register('city')}
              />
              <TextField
                label="Contact number"
                error={!!errors.contactNumber}
                helperText={errors.contactNumber?.message ?? 'Optional'}
                {...register('contactNumber')}
              />
            </Stack>

            <TextField
              label="Description"
              multiline
              minRows={3}
              error={!!errors.description}
              helperText={errors.description?.message ?? 'Optional'}
              {...register('description')}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving…'
              : isEdit
                ? 'Save changes'
                : `Create ${PROPERTY_TERM.singularLower}`}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
