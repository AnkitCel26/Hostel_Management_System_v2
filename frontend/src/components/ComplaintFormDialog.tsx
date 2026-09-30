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
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';

import { ComplaintStatusChip } from './ComplaintStatusChip';
import {
  CREATE_COMPLAINT_MUTATION,
  UPDATE_COMPLAINT_MUTATION
} from '../graphql/operations';
import type { Complaint, ComplaintStatus } from '../types';
import { getGraphQLErrorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';

const TITLE_MAX = 160;
const DESCRIPTION_MAX = 5000;

const complaintSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Enter a short summary of the problem')
    .max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or fewer`),
  description: z
    .string()
    .trim()
    .min(1, 'Describe what happened')
    .max(DESCRIPTION_MAX, `Description must be ${DESCRIPTION_MAX.toLocaleString()} characters or fewer`),
  status: z.enum(['open', 'in_progress', 'resolved'])
});

type ComplaintFormData = z.infer<typeof complaintSchema>;

const STATUS_OPTIONS: { value: ComplaintStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' }
];

interface ComplaintFormDialogProps {
  open: boolean;
  mode: 'create' | 'update';
  complaint?: Complaint | null;
  propertyName?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function ComplaintFormDialog({
  open,
  mode,
  complaint,
  propertyName,
  onClose,
  onSaved
}: ComplaintFormDialogProps) {
  const isEdit = mode === 'update';
  const [serverError, setServerError] = React.useState<string | null>(null);

  // No refetchQueries: the parent refetches its own query in onSaved, and
  // updated Complaint entities merge into the Apollo cache by id.
  const [createComplaint] = useMutation(CREATE_COMPLAINT_MUTATION);
  const [updateComplaint] = useMutation(UPDATE_COMPLAINT_MUTATION);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<ComplaintFormData>({
    resolver: zodResolver(complaintSchema),
    defaultValues: { title: '', description: '', status: 'open' }
  });

  React.useEffect(() => {
    if (open) {
      setServerError(null);
      reset({
        title: complaint?.title ?? '',
        description: complaint?.description ?? '',
        status: complaint?.status ?? 'open'
      });
    }
  }, [open, complaint, reset]);

  const values = watch();
  const titleLength = values.title?.length ?? 0;
  const descriptionLength = values.description?.length ?? 0;

  const onSubmit = async (data: ComplaintFormData): Promise<void> => {
    setServerError(null);
    try {
      if (isEdit && complaint) {
        await updateComplaint({
          variables: {
            id: complaint.id,
            input: {
              title: data.title,
              description: data.description,
              status: data.status
            }
          }
        });
        const tenantName = complaint.tenant?.name;
        onSaved(
          tenantName
            ? `Complaint for ${tenantName} updated.`
            : 'Complaint updated.'
        );
      } else {
        await createComplaint({
          variables: {
            input: { title: data.title, description: data.description }
          }
        });
        onSaved('Complaint submitted. The property team has been notified.');
      }
    } catch (error) {
      setServerError(
        getGraphQLErrorMessage(
          error,
          isEdit
            ? 'Unable to update the complaint. Please try again.'
            : 'Unable to submit the complaint. Please try again.'
        )
      );
    }
  };

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Update complaint' : 'Report a complaint'}</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit(onSubmit)} noValidate spacing={0}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {serverError ? (
              <Alert severity="error" role="alert">
                {serverError}
              </Alert>
            ) : null}

            {isEdit && complaint ? (
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
                      {complaint.tenant?.name ?? 'Tenant'}
                      {complaint.tenant?.user?.email ? ` · ${complaint.tenant.user.email}` : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {complaint.pg?.name ?? complaint.tenant?.pg?.name ?? '—'} · Filed{' '}
                      {formatDate(complaint.createdAt)}
                      {complaint.resolvedAt
                        ? ` · Resolved ${formatDate(complaint.resolvedAt)}`
                        : ''}
                    </Typography>
                  </Box>
                  <ComplaintStatusChip status={complaint.status} />
                </Stack>
              </Box>
            ) : null}

            <TextField
              label="Title"
              required
              autoFocus
              error={!!errors.title}
              helperText={
                errors.title?.message ??
                `One line summarising the problem (${titleLength}/${TITLE_MAX})`
              }
              inputProps={{ maxLength: TITLE_MAX }}
              {...register('title')}
            />

            <TextField
              label="Description"
              required
              multiline
              minRows={4}
              error={!!errors.description}
              helperText={
                errors.description?.message ??
                `What happened, where, and what you expect (${descriptionLength.toLocaleString()}/${DESCRIPTION_MAX.toLocaleString()})`
              }
              inputProps={{ maxLength: DESCRIPTION_MAX }}
              {...register('description')}
            />

            {isEdit ? (
              <TextField
                select
                label="Status"
                required
                error={!!errors.status}
                helperText={
                  errors.status?.message ??
                  'Marking a complaint resolved records the resolved date automatically'
                }
                inputProps={{ 'aria-label': 'Complaint status' }}
                {...register('status')}
              >
                {STATUS_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <Alert severity="info" icon={false}>
                {propertyName
                  ? `This complaint goes to the ${propertyName} property team and starts as open. You can follow its status on this page.`
                  : 'This complaint goes to your property team and starts as open. You can follow its status on this page.'}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Submit complaint'}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
