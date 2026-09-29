import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import {
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CampaignIcon from '@mui/icons-material/Campaign';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';

import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { PageHeader } from '../../components/PageHeader';
import { AnnouncementFormDialog } from '../../components/admin/AnnouncementFormDialog';
import { useSnackbar } from '../../context/SnackbarContext';
import {
  GET_ALL_ANNOUNCEMENTS_QUERY,
  GET_ALL_PGS_QUERY
} from '../../graphql/operations';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { Announcement, AnnouncementPage, Pg } from '../../types';
import { formatDate } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetAllAnnouncementsData {
  getAllAnnouncements: AnnouncementPage;
}

interface GetAllPgsData {
  getAllPgs: Pg[];
}

/** Table head cells: muted uppercase labels over a tinted strip. */
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

/** Bordered icon button — same treatment as the rooms, tenants, and payments pages. */
const actionIconSx = {
  border: 1,
  borderColor: 'divider',
  borderRadius: 2,
  bgcolor: 'background.paper'
} as const;

/** Long messages collapse to two lines; the full text stays in the title attribute. */
const contentSx = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
} as const;

/**
 * Admin announcements page (/admin/announcements): the searchable, filterable
 * list of every property announcement with publish and edit actions
 * (FR-25 create, FR-26 update). Deleting announcements is not part of the MRD,
 * so this page only publishes and edits.
 */
export function AdminAnnouncementsPage() {
  const [searchParams] = useSearchParams();
  const { success } = useSnackbar();

  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [pgFilter, setPgFilter] = React.useState(() => searchParams.get('pgId') ?? '');
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const [dialog, setDialog] = React.useState<{ open: boolean; announcement: Announcement | null }>({
    open: false,
    announcement: null
  });

  // Filters returning to their default values restart pagination.
  React.useEffect(() => {
    setPage(0);
  }, [debouncedSearch, pgFilter]);

  const trimmedSearch = debouncedSearch.trim();
  const { data, previousData, loading, error, refetch } = useQuery<GetAllAnnouncementsData>(
    GET_ALL_ANNOUNCEMENTS_QUERY,
    {
      variables: {
        search: trimmedSearch === '' ? undefined : trimmedSearch,
        pgId: pgFilter === '' ? undefined : pgFilter,
        limit: rowsPerPage,
        offset: page * rowsPerPage
      },
      notifyOnNetworkStatusChange: true
    }
  );
  const pgsQuery = useQuery<GetAllPgsData>(GET_ALL_PGS_QUERY);

  // Keep the previous page visible while a refetch is in flight (no flicker).
  const announcementPage = data?.getAllAnnouncements ?? previousData?.getAllAnnouncements ?? null;
  const announcements = announcementPage?.items ?? [];
  const total = announcementPage?.total ?? 0;
  const pgs = pgsQuery.data?.getAllPgs ?? [];
  const pgsLoading = pgsQuery.loading;
  const hasActiveFilters = trimmedSearch !== '' || pgFilter !== '';
  // An announcement cannot be posted without a property to post it to.
  const canPublish = !pgsLoading && pgs.length > 0;

  const openCreate = (): void => setDialog({ open: true, announcement: null });
  const openEdit = (announcement: Announcement): void =>
    setDialog({ open: true, announcement });
  const closeDialog = (): void => setDialog({ open: false, announcement: null });

  const handleSaved = (message: string): void => {
    const wasCreate = dialog.announcement === null;
    closeDialog();
    success(message);
    // A new announcement is the newest item, so return to the first page.
    if (wasCreate) setPage(0);
    void refetch();
  };

  const clearFilters = (): void => {
    setSearchInput('');
    setPgFilter('');
  };

  return (
    <Box>
      <PageHeader
        title="Announcements"
        subtitle="Post updates and notices to your tenants, and keep them current."
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreate}
            disabled={!canPublish}
          >
            New Announcement
          </Button>
        }
      />

      {!pgsLoading && pgs.length === 0 ? (
        <Box sx={{ mb: 3 }}>
          <ErrorAlert
            title={`No ${PROPERTY_TERM.pluralLower} yet`}
            message={`Create a ${PROPERTY_TERM.singularLower} first — announcements are posted to a ${PROPERTY_TERM.singularLower}.`}
          />
        </Box>
      ) : null}

      {/* Toolbar */}
      <Card sx={{ mb: 3 }}>
        <CardContent
          sx={{
            p: 2,
            '&:last-child': { pb: 2 },
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { sm: 'center' },
            gap: 2
          }}
        >
          <TextField
            label="Search announcements"
            placeholder="Title, message, or property name"
            size="small"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" fontSize="small" />
                </InputAdornment>
              )
            }}
            inputProps={{
              'aria-label': 'Search announcements by title, message, or property name'
            }}
            sx={{ flexGrow: 1 }}
          />
          <TextField
            select
            label={PROPERTY_TERM.singular}
            size="small"
            value={pgFilter}
            onChange={(event) => setPgFilter(event.target.value)}
            sx={{ minWidth: { sm: 180 } }}
            inputProps={{ 'aria-label': `Filter announcements by ${PROPERTY_TERM.singularLower}` }}
          >
            <MenuItem value="">
              All {PROPERTY_TERM.pluralLower}
            </MenuItem>
            {pgs.map((pg) => (
              <MenuItem key={pg.id} value={pg.id}>
                {pg.name}
              </MenuItem>
            ))}
          </TextField>
          {announcementPage ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap' }}
            >
              {announcements.length} of {total} announcement{total === 1 ? '' : 's'}
            </Typography>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Stack spacing={2} alignItems="flex-start">
          <ErrorAlert title="Unable to load announcements" message={error.message} />
          <Button variant="outlined" onClick={() => void refetch()}>
            Retry
          </Button>
        </Stack>
      ) : !announcementPage && loading ? (
        <LoadingIndicator label="Loading announcements…" />
      ) : announcements.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CampaignIcon fontSize="large" />}
            title={
              hasActiveFilters ? 'No announcements match your filters' : 'No announcements yet'
            }
            message={
              hasActiveFilters
                ? 'Try a different search term or clear the filters.'
                : `Post your first update — maintenance work, events, or notices — and every tenant at that ${PROPERTY_TERM.singularLower} will see it.`
            }
            action={
              hasActiveFilters ? (
                <Button variant="outlined" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : canPublish ? (
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                  New Announcement
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card sx={{ position: 'relative', overflow: 'hidden' }}>
          {loading ? (
            <LinearProgress
              aria-label="Refreshing announcements"
              sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}
            />
          ) : null}
          <TableContainer>
            <Table aria-label="Announcements">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>Announcement</TableCell>
                  <TableCell sx={{ ...headCellSx, display: { xs: 'none', md: 'table-cell' } }}>
                    {PROPERTY_TERM.singular}
                  </TableCell>
                  <TableCell sx={{ ...headCellSx, display: { xs: 'none', lg: 'table-cell' } }}>
                    Posted by
                  </TableCell>
                  <TableCell sx={{ ...headCellSx, display: { xs: 'none', sm: 'table-cell' } }}>
                    Posted
                  </TableCell>
                  <TableCell sx={headCellSx} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {announcements.map((announcement) => (
                  <TableRow key={announcement.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell sx={{ maxWidth: 420 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {announcement.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        title={announcement.content}
                        sx={contentSx}
                      >
                        {announcement.content}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      <Typography variant="body2">{announcement.pg?.name ?? '—'}</Typography>
                      {announcement.pg?.city ? (
                        <Typography variant="caption" color="text.secondary">
                          {announcement.pg.city}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                      <Typography variant="body2">
                        {announcement.createdBy?.name ?? '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {announcement.createdBy?.email ?? ''}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Typography variant="body2">{formatDate(announcement.createdAt)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={`Edit "${announcement.title}"`}>
                        <IconButton
                          aria-label={`Edit announcement ${announcement.title}`}
                          size="small"
                          onClick={() => openEdit(announcement)}
                          sx={actionIconSx}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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
            rowsPerPageOptions={[5, 10, 20, 50]}
            sx={{ borderTop: 1, borderColor: 'divider' }}
          />
        </Card>
      )}

      <AnnouncementFormDialog
        open={dialog.open}
        announcement={dialog.announcement}
        pgs={pgs}
        defaultPgId={pgFilter}
        onClose={closeDialog}
        onSaved={handleSaved}
      />
    </Box>
  );
}
