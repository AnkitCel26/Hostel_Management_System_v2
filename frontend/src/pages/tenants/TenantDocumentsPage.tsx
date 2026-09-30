import React from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  Box,
  Button,
  Card,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DocumentFormDialog } from '../../components/DocumentFormDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { PageHeader } from '../../components/PageHeader';
import { useSnackbar } from '../../context/SnackbarContext';
import {
  DELETE_TENANT_DOCUMENTS_MUTATION,
  GET_TENANT_DOCUMENTS_QUERY,
  GET_TENANT_PG_ROOM_QUERY
} from '../../graphql/operations';
import {
  DocumentStorageError,
  isDocumentStorageConfigured,
  removeDocumentFile
} from '../../supabase/client';
import type { TenantDocument, TenantDocumentPage, TenantPgRoom } from '../../types';
import { getGraphQLErrorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetTenantDocumentsData {
  getTenantDocuments: TenantDocumentPage;
}

interface GetTenantPgRoomData {
  getTenantPgRoom: TenantPgRoom | null;
}

const iconBadgeSx = {
  width: 36,
  height: 36,
  borderRadius: 2.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: 'primary.main',
  bgcolor: (theme: { palette: { primary: { main: string } } }) =>
    alpha(theme.palette.primary.main, 0.1)
} as const;

const headCellSx = {
  fontSize: '0.6875rem',
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: 'text.secondary',
  bgcolor: 'background.default',
  borderBottom: 2,
  borderColor: 'divider',
  py: 1.5
} as const;

const actionIconSx = {
  border: 1,
  borderColor: 'divider',
  borderRadius: 2,
  bgcolor: 'background.paper'
} as const;

function getFileLabel(docUrl: string): string {
  try {
    const path = new URL(docUrl).pathname;
    const name = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
    const prefix = /^[0-9a-fA-F-]{36}-/.exec(name);
    return (prefix ? name.slice(prefix[0].length) : name) || name;
  } catch {
    return '';
  }
}

export function TenantDocumentsPage() {
  const { success, error: notifyError } = useSnackbar();
  const storageReady = isDocumentStorageConfigured();

  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [dialog, setDialog] = React.useState<{ open: boolean; document: TenantDocument | null }>({
    open: false,
    document: null
  });
  const [deleteTarget, setDeleteTarget] = React.useState<TenantDocument | null>(null);

  const assignmentQuery = useQuery<GetTenantPgRoomData>(GET_TENANT_PG_ROOM_QUERY);
  const assignment = assignmentQuery.data?.getTenantPgRoom ?? null;
  const canUpload = assignment !== null && !assignmentQuery.loading;

  const { data, previousData, loading, error, refetch } = useQuery<GetTenantDocumentsData>(
    GET_TENANT_DOCUMENTS_QUERY,
    {
      variables: { limit: rowsPerPage, offset: page * rowsPerPage },
      notifyOnNetworkStatusChange: true
    }
  );

  const [deleteDocumentRecord, { loading: deleting }] = useMutation(DELETE_TENANT_DOCUMENTS_MUTATION);

  // Keep the previous page visible while a refetch is in flight (no flicker).
  const documentPage = data?.getTenantDocuments ?? previousData?.getTenantDocuments ?? null;
  const documents = documentPage?.items ?? [];
  const total = documentPage?.total ?? 0;

  const openCreate = (): void => setDialog({ open: true, document: null });
  const openEdit = (document: TenantDocument): void => setDialog({ open: true, document });
  const closeDialog = (): void => setDialog({ open: false, document: null });

  const refreshAt = async (targetPage: number): Promise<void> => {
    if (targetPage !== page) setPage(targetPage);
    try {
      await refetch({ limit: rowsPerPage, offset: targetPage * rowsPerPage });
    } catch {
      // Handled by the query's error state below.
    }
  };

  const handleSaved = (message: string): void => {
    const wasCreate = dialog.document === null;
    closeDialog();
    success(message);
    void refreshAt(wasCreate ? 0 : page);
  };

  const closeDelete = (): void => {
    if (!deleting) setDeleteTarget(null);
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const wasLastItemOnPage = documents.length === 1;
    try {
      await deleteDocumentRecord({ variables: { ids: [target.id] } });
      setDeleteTarget(null);
      success(`"${target.docName}" deleted.`);
      void refreshAt(wasLastItemOnPage && page > 0 ? page - 1 : page);
      removeDocumentFile(target.docUrl).catch((storageError: unknown) => {
        notifyError(
          storageError instanceof DocumentStorageError
            ? `${storageError.message} The document entry was still deleted.`
            : 'The document was deleted, but its stored file could not be removed.'
        );
      });
    } catch (deleteError) {
      setDeleteTarget(null);
      notifyError(getGraphQLErrorMessage(deleteError, 'Unable to delete the document.'));
    }
  };

  return (
    <Box>
      <PageHeader
        title="My Documents"
        subtitle={`Keep your ID proofs and agreements in one place, and share them with the ${PROPERTY_TERM.singularLower} team any time.`}
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreate}
            disabled={!canUpload || !storageReady}
          >
            Upload Document
          </Button>
        }
      />

      {!storageReady ? (
        <Box sx={{ mb: 3 }}>
          <ErrorAlert
            title="Document storage is not configured"
            message={`Files are stored in Supabase, and this deployment is missing the Supabase settings. Ask your administrator to configure storage, then reload this page.`}
          />
        </Box>
      ) : null}

      {!assignmentQuery.loading && !assignmentQuery.error && !assignment ? (
        <Box sx={{ mb: 3 }}>
          <ErrorAlert
            title="No tenant record yet"
            message={`You need to be assigned to a ${PROPERTY_TERM.singularLower} before you can upload documents. Your administrator can set this up from Tenant Management.`}
          />
        </Box>
      ) : null}

      {error ? (
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert title="Unable to load your documents" message={error.message} />
          <Button variant="outlined" onClick={() => void refetch()}>
            Retry
          </Button>
        </Stack>
      ) : !documentPage && loading ? (
        <LoadingIndicator label="Loading your documents…" />
      ) : documents.length === 0 ? (
        <Card>
          <EmptyState
            icon={<DescriptionIcon fontSize="large" />}
            title="No documents yet"
            message={
              canUpload && storageReady
                ? 'Upload your Aadhaar card, passport, rent agreement, or any other paper the property team may ask for.'
                : `Once you are assigned to a ${PROPERTY_TERM.singularLower} and storage is configured, you can upload your documents here.`
            }
            action={
              canUpload && storageReady ? (
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                  Upload Document
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card sx={{ position: 'relative', overflow: 'hidden' }}>
          {loading ? (
            <LinearProgress
              aria-label="Refreshing your documents"
              sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}
            />
          ) : null}
          <TableContainer>
            <Table aria-label="My documents">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>Document</TableCell>
                  <TableCell sx={{ ...headCellSx, display: { xs: 'none', sm: 'table-cell' } }}>
                    Document number
                  </TableCell>
                  <TableCell sx={{ ...headCellSx, display: { xs: 'none', md: 'table-cell' } }}>
                    Uploaded
                  </TableCell>
                  <TableCell sx={headCellSx} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {documents.map((document) => {
                  const fileLabel = getFileLabel(document.docUrl);
                  return (
                    <TableRow
                      key={document.id}
                      hover
                      sx={{ '&:last-child td': { borderBottom: 0 } }}
                    >
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                          <Box sx={iconBadgeSx}>
                            <DescriptionIcon fontSize="small" />
                          </Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {document.docName}
                            </Typography>
                            {fileLabel ? (
                              <Typography variant="caption" color="text.secondary" noWrap display="block">
                                {fileLabel}
                              </Typography>
                            ) : null}
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Typography variant="body2">{document.docNumber ?? '—'}</Typography>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        <Typography variant="body2">{formatDate(document.createdAt)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack
                          direction="row"
                          spacing={1}
                          justifyContent="flex-end"
                          sx={{ flexWrap: 'nowrap' }}
                        >
                          <Tooltip title={`Open "${document.docName}" in a new tab`}>
                            <IconButton
                              component="a"
                              href={document.docUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open document ${document.docName} in a new tab`}
                              size="small"
                              sx={actionIconSx}
                            >
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={`Edit "${document.docName}"`}>
                            <IconButton
                              aria-label={`Edit document ${document.docName}`}
                              size="small"
                              onClick={() => openEdit(document)}
                              sx={actionIconSx}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={`Delete "${document.docName}"`}>
                            <IconButton
                              aria-label={`Delete document ${document.docName}`}
                              size="small"
                              onClick={() => setDeleteTarget(document)}
                              sx={{ ...actionIconSx, color: 'error.main' }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {total > rowsPerPage ? (
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_event, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(event) => {
                setRowsPerPage(parseInt(event.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 20]}
              sx={{ borderTop: 1, borderColor: 'divider' }}
            />
          ) : null}
        </Card>
      )}

      <DocumentFormDialog
        open={dialog.open}
        mode={dialog.document ? 'update' : 'create'}
        document={dialog.document}
        onClose={closeDialog}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this document?"
        message={
          deleteTarget
            ? `"${deleteTarget.docName}" will be removed from your documents along with its stored file. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete document"
        destructive
        busy={deleting}
        onCancel={closeDelete}
        onConfirm={() => void handleDelete()}
      />
    </Box>
  );
}
