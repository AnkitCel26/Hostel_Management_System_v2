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
  Stack,
  TextField,
  Typography
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';

import { useAuth } from '../context/AuthContext';
import {
  UPDATE_TENANT_DOCS_MUTATION,
  UPLOAD_TENANT_DOCS_MUTATION
} from '../graphql/operations';
import {
  DocumentStorageError,
  formatFileSize,
  getDocumentFileError,
  isDocumentStorageConfigured,
  MAX_DOCUMENT_SIZE_BYTES,
  removeDocumentFile,
  uploadDocumentFile
} from '../supabase/client';
import type { TenantDocument } from '../types';
import { getGraphQLErrorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';

// Limits mirror the backend document service validation (document.service.ts).
const DOC_NAME_MAX = 120;
const DOC_NUMBER_MAX = 60;

/** Storage failures are Errors; give them a message that reads like the rest. */
const documentSchema = z.object({
  docName: z
    .string()
    .trim()
    .min(1, 'Enter a name for this document')
    .max(DOC_NAME_MAX, `Document name must be ${DOC_NAME_MAX} characters or fewer`),
  docNumber: z
    .string()
    .trim()
    .max(DOC_NUMBER_MAX, `Document number must be ${DOC_NUMBER_MAX} characters or fewer`)
});

type DocumentFormData = z.infer<typeof documentSchema>;

interface DocumentFormDialogProps {
  open: boolean;
  /**
   * `create` uploads a new file and records it; `update` edits the metadata of
   * an existing document and can optionally replace its file.
   */
  mode: 'create' | 'update';
  /** The document being updated; ignored in create mode. */
  document?: TenantDocument | null;
  onClose: () => void;
  /** Called after a successful save; the parent shows feedback and refetches. */
  onSaved: (message: string) => void;
}

/** Turns a storage or GraphQL failure into a message safe to show inline. */
function getFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof DocumentStorageError) return error.message;
  return getGraphQLErrorMessage(error, fallback);
}

/**
 * Tenant document form (Phase 9, FR-29). The file is uploaded to Supabase
 * storage first and only its URL and metadata are recorded through the
 * backend, so the database never stores file bytes. The tenant itself is
 * always derived by the server from the caller.
 */
export function DocumentFormDialog({
  open,
  mode,
  document,
  onClose,
  onSaved
}: DocumentFormDialogProps) {
  const { user } = useAuth();
  const isEdit = mode === 'update';
  const storageReady = isDocumentStorageConfigured();

  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // No refetchQueries: the parent refetches its own query in onSaved, and
  // returned TenantDocument entities merge into the Apollo cache by id.
  const [uploadTenantDocs] = useMutation(UPLOAD_TENANT_DOCS_MUTATION);
  const [updateTenantDocs] = useMutation(UPDATE_TENANT_DOCS_MUTATION);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting }
  } = useForm<DocumentFormData>({
    resolver: zodResolver(documentSchema),
    defaultValues: { docName: '', docNumber: '' }
  });

  // Load the record being edited (or blank defaults) each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setServerError(null);
      setFile(null);
      setFileError(null);
      reset({
        docName: document?.docName ?? '',
        docNumber: document?.docNumber ?? ''
      });
    }
  }, [open, document, reset]);

  const docNameValue = watch('docName');
  const docNumberValue = watch('docNumber');
  // While a new file is chosen, its own name is the suggested document name.
  const fileIsNamed = !isEdit && (docNameValue ?? '').trim() === '';

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    if (!selected) {
      setFileError(null);
      return;
    }
    const problem = getDocumentFileError(selected);
    setFileError(problem);
    if (!problem && fileIsNamed) {
      // Name the document after the file until the tenant types their own.
      setValue('docName', selected.name, { shouldValidate: false });
      void trigger('docName');
    }
  };

  const onSubmit = async (data: DocumentFormData): Promise<void> => {
    if (!user) {
      setServerError('Your session has expired. Please sign in again.');
      return;
    }

    // Re-check the file here: a dialog can be reopened with a stale error.
    const problem = isEdit && !file ? null : getDocumentFileError(file);
    if (problem) {
      setFileError(problem);
      return;
    }

    setServerError(null);
    // Tracked so a failed metadata write can clean up the orphaned upload.
    let uploadedUrl: string | null = null;

    try {
      if (isEdit && document) {
        if (file) {
          const stored = await uploadDocumentFile(file, user.id);
          uploadedUrl = stored.url;
        }
        await updateTenantDocs({
          variables: {
            id: document.id,
            input: {
              docName: data.docName,
              docNumber: data.docNumber === '' ? null : data.docNumber,
              ...(uploadedUrl ? { docUrl: uploadedUrl } : {})
            }
          }
        });
        if (uploadedUrl && uploadedUrl !== document.docUrl) {
          // The record now points at the new file; drop the replaced one.
          // Best effort only — a leftover old file must not fail the update.
          void removeDocumentFile(document.docUrl).catch(() => undefined);
        }
        onSaved(`"${data.docName}" updated.`);
      } else {
        if (!file) {
          setFileError('Choose a file to upload');
          return;
        }
        const stored = await uploadDocumentFile(file, user.id);
        uploadedUrl = stored.url;
        await uploadTenantDocs({
          variables: {
            input: {
              docs: [
                {
                  docName: data.docName,
                  docUrl: stored.url,
                  docNumber: data.docNumber === '' ? null : data.docNumber
                }
              ]
            }
          }
        });
        onSaved(`"${data.docName}" uploaded.`);
      }
    } catch (error) {
      if (uploadedUrl) {
        // The record was never written, so the storage object is an orphan.
        void removeDocumentFile(uploadedUrl).catch(() => undefined);
      }
      setServerError(
        getFailureMessage(
          error,
          isEdit
            ? 'Unable to update the document. Please try again.'
            : 'Unable to upload the document. Please try again.'
        )
      );
    }
  };

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Update document' : 'Upload document'}</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit(onSubmit)} noValidate spacing={0}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {serverError ? (
              <Alert severity="error" role="alert">
                {serverError}
              </Alert>
            ) : null}

            {!storageReady ? (
              <Alert severity="warning">
                Document storage is not configured for this deployment. Ask your administrator to
                set up the Supabase connection before uploading files.
              </Alert>
            ) : null}

            {isEdit && document ? (
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
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                  <DescriptionIcon color="action" />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {document.docName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                      Added {formatDate(document.createdAt)} ·{' '}
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        sx={{ wordBreak: 'break-all' }}
                      >
                        {document.docUrl}
                      </Typography>
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ) : null}

            <Box>
              <Typography component="label" htmlFor="document-file" variant="body2" fontWeight={500}>
                {isEdit ? 'Replace file (optional)' : 'File'}
                {!isEdit ? ' *' : ''}
              </Typography>
              <Button
                component="label"
                htmlFor="document-file"
                variant="outlined"
                startIcon={<DescriptionIcon />}
                sx={{ mt: 0.75, display: 'flex' }}
                disabled={isSubmitting}
              >
                {file ? file.name : 'Choose file'}
              </Button>
              <input
                id="document-file"
                type="file"
                hidden
                disabled={isSubmitting}
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
              />
              <Typography
                variant="caption"
                color={fileError ? 'error.main' : 'text.secondary'}
                display="block"
                sx={{ mt: 0.75 }}
                role={fileError ? 'alert' : undefined}
              >
                {fileError ??
                  (file
                    ? `${formatFileSize(file.size)} · PDF, PNG, JPEG or WebP up to ${formatFileSize(MAX_DOCUMENT_SIZE_BYTES)}`
                    : `PDF, PNG, JPEG or WebP up to ${formatFileSize(MAX_DOCUMENT_SIZE_BYTES)}`)}
              </Typography>
            </Box>

            <TextField
              label="Document name"
              required
              autoFocus={!isEdit}
              error={!!errors.docName}
              helperText={
                errors.docName?.message ??
                `How this document appears in your list (${(docNameValue ?? '').length}/${DOC_NAME_MAX})`
              }
              inputProps={{ maxLength: DOC_NAME_MAX }}
              {...register('docName')}
            />

            <TextField
              label="Document number (optional)"
              error={!!errors.docNumber}
              helperText={
                errors.docNumber?.message ??
                `For example an ID or registration number (${
                  (docNumberValue ?? '').length
                }/${DOC_NUMBER_MAX})`
              }
              inputProps={{ maxLength: DOC_NUMBER_MAX }}
              {...register('docNumber')}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting || !storageReady}>
            {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Upload document'}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
