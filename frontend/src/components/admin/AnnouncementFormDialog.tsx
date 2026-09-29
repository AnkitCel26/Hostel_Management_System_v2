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

import {
  CREATE_ANNOUNCEMENT_MUTATION,
  UPDATE_ANNOUNCEMENT_MUTATION
} from '../../graphql/operations';
import type { Announcement, Pg } from '../../types';
import { getGraphQLErrorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

// Limits mirror the backend announcement service validation
// (announcement.service.ts).
const TITLE_MAX = 160;
const CONTENT_MAX = 5000;

const announcementSchema = z.object({
  pgId: z.string().min(1, `Select a ${PROPERTY_TERM.singularLower}`),
  title: z
    .string()
    .trim()
    .min(1, 'Enter a short headline')
    .max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or fewer`),
  content: z
    .string()
    .trim()
    .min(1, 'Write the announcement body')
    .max(CONTENT_MAX, `Content must be ${CONTENT_MAX.toLocaleString()} characters or fewer`)
});

type AnnouncementFormData = z.infer<typeof announcementSchema>;

interface AnnouncementFormDialogProps {
  open: boolean;
  /** The announcement being edited, or null to publish a new one. */
  announcement: Announcement | null;
  /** Properties available to post under (admin list API). */
  pgs: Pg[];
  /** Property pre-selected when publishing (e.g. the active page filter). */
  defaultPgId?: string;
  onClose: () => void;
  /** Called after a successful save; the parent shows feedback and refetches. */
  onSaved: (message: string) => void;
}

/**
 * Shared announcement form for the admin portal (FR-25 publish, FR-26
 * manage). The property is chosen when publishing and shown read-only while
 * editing — an announcement can never move to another property. The creator is
 * always the signed-in admin; the server derives it, so it is never sent.
 */
export function AnnouncementFormDialog({
  open,
  announcement,
  pgs,
  defaultPgId = '',
  onClose,
  onSaved
}: AnnouncementFormDialogProps) {
  const isEdit = announcement !== null;
  const [serverError, setServerError] = React.useState<string | null>(null);

  // No refetchQueries: the parent refetches its own query in onSaved, and
  // updated Announcement entities merge into the Apollo cache by id.
  const [createAnnouncement] = useMutation(CREATE_ANNOUNCEMENT_MUTATION);
  const [updateAnnouncement] = useMutation(UPDATE_ANNOUNCEMENT_MUTATION);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<AnnouncementFormData>({
    resolver: zodResolver(announcementSchema),
    defaultValues: { pgId: '', title: '', content: '' }
  });

  // Load the record being edited (or blank defaults) each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setServerError(null);
      reset({
        pgId: announcement?.pg?.id ?? defaultPgId,
        title: announcement?.title ?? '',
        content: announcement?.content ?? ''
      });
    }
  }, [open, announcement, defaultPgId, reset]);

  const values = watch();
  const titleLength = values.title?.length ?? 0;
  const contentLength = values.content?.length ?? 0;

  // Sorting is newest-first, so a new announcement belongs on the first page.
  const onSubmit = async (data: AnnouncementFormData): Promise<void> => {
    setServerError(null);
    try {
      if (isEdit) {
        await updateAnnouncement({
          variables: {
            id: announcement.id,
            input: { title: data.title, content: data.content }
          }
        });
        onSaved(`Announcement "${data.title}" updated.`);
      } else {
        await createAnnouncement({
          variables: {
            input: { pgId: data.pgId, title: data.title, content: data.content }
          }
        });
        const propertyName =
          pgs.find((pg) => pg.id === data.pgId)?.name ?? PROPERTY_TERM.singularLower;
        onSaved(`Announcement published to ${propertyName}.`);
      }
    } catch (error) {
      setServerError(
        getGraphQLErrorMessage(
          error,
          isEdit
            ? 'Unable to update the announcement. Please try again.'
            : 'Unable to publish the announcement. Please try again.'
        )
      );
    }
  };

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Edit announcement' : 'New announcement'}</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit(onSubmit)} noValidate spacing={0}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {serverError ? (
              <Alert severity="error" role="alert">
                {serverError}
              </Alert>
            ) : null}

            {!isEdit && pgs.length === 0 ? (
              <Alert severity="info">
                No {PROPERTY_TERM.pluralLower} exist yet. Create a {PROPERTY_TERM.singularLower}{' '}
                first, then post an announcement to it.
              </Alert>
            ) : null}

            {isEdit ? (
              <>
                <TextField
                  label={PROPERTY_TERM.singular}
                  value={announcement.pg?.name ?? '—'}
                  InputProps={{ readOnly: true }}
                  helperText="Announcements stay with the property they were posted to."
                />
                <Box
                  sx={{
                    px: 2,
                    py: 1.25,
                    borderRadius: 2,
                    bgcolor: 'background.default',
                    border: 1,
                    borderColor: 'divider'
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Posted by {announcement.createdBy?.name ?? 'an administrator'} on{' '}
                    {formatDate(announcement.createdAt)}
                  </Typography>
                </Box>
              </>
            ) : (
              <TextField
                select
                label={PROPERTY_TERM.singular}
                required
                error={!!errors.pgId}
                helperText={
                  errors.pgId?.message ??
                  `Everyone living at this ${PROPERTY_TERM.singularLower} will see the announcement`
                }
                inputProps={{ 'aria-label': `Select the ${PROPERTY_TERM.singularLower} to post to` }}
                {...register('pgId')}
              >
                {pgs.map((pg) => (
                  <MenuItem key={pg.id} value={pg.id}>
                    {pg.name}
                    {pg.city ? ` · ${pg.city}` : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              label="Title"
              required
              autoFocus
              error={!!errors.title}
              helperText={
                errors.title?.message ?? `One line tenants will see first (${titleLength}/${TITLE_MAX})`
              }
              inputProps={{ maxLength: TITLE_MAX }}
              {...register('title')}
            />

            <TextField
              label="Message"
              required
              multiline
              minRows={5}
              error={!!errors.content}
              helperText={
                errors.content?.message ??
                `The full announcement text (${contentLength.toLocaleString()}/${CONTENT_MAX.toLocaleString()})`
              }
              inputProps={{ maxLength: CONTENT_MAX }}
              {...register('content')}
            />

            <Alert severity="info" icon={false}>
              The announcement is posted as your name. Tenants see it on their Announcements page
              straight away.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || (!isEdit && pgs.length === 0)}
          >
            {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Publish announcement'}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
