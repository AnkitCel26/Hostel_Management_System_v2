import React from 'react';
import { useQuery } from '@apollo/client';
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  LinearProgress,
  Stack,
  TablePagination,
  Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CampaignIcon from '@mui/icons-material/Campaign';
import PersonIcon from '@mui/icons-material/Person';

import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { PageHeader } from '../../components/PageHeader';
import { GET_TENANT_PG_ANNOUNCEMENTS_QUERY } from '../../graphql/operations';
import type { AnnouncementPage } from '../../types';
import { formatDate } from '../../utils/format';
import { PROPERTY_TERM } from '../../utils/labels';

interface GetTenantPgAnnouncementsData {
  getTenantPgAnnouncements: AnnouncementPage;
}

const iconBadgeSx = {
  width: 40,
  height: 40,
  borderRadius: 2.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: 'primary.main',
  bgcolor: (theme: { palette: { primary: { main: string } } }) =>
    alpha(theme.palette.primary.main, 0.1)
} as const;

export function TenantAnnouncementsPage() {
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);

  const { data, previousData, loading, error, refetch } = useQuery<GetTenantPgAnnouncementsData>(
    GET_TENANT_PG_ANNOUNCEMENTS_QUERY,
    {
      variables: { limit: rowsPerPage, offset: page * rowsPerPage },
      notifyOnNetworkStatusChange: true
    }
  );

  const announcementPage =
    data?.getTenantPgAnnouncements ?? previousData?.getTenantPgAnnouncements ?? null;
  const announcements = announcementPage?.items ?? [];
  const total = announcementPage?.total ?? 0;
  // The property name comes from the announcements themselves, so it is only
  // known once the first item has loaded.
  const propertyName = announcements[0]?.pg?.name ?? null;

  return (
    <Box>
      <PageHeader
        title="Announcements"
        subtitle={
          propertyName
            ? `Updates and notices posted by the ${propertyName} team.`
            : `Updates and notices posted by your ${PROPERTY_TERM.singularLower} team.`
        }
      />

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
            title="Nothing to read yet"
            message={`When your ${PROPERTY_TERM.singularLower} team posts an update — maintenance work, an event, or a notice — it will appear here.`}
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
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <Stack divider={<Divider flexItem />}>
              {announcements.map((announcement) => (
                <Box key={announcement.id} sx={{ p: { xs: 2, sm: 3 } }}>
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box sx={iconBadgeSx}>
                      <CampaignIcon fontSize="small" />
                    </Box>
                    <Typography variant="subtitle1" fontWeight={600} sx={{ minWidth: 0 }}>
                      {announcement.title}
                    </Typography>
                  </Stack>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ whiteSpace: 'pre-wrap', mt: 1.5 }}
                  >
                    {announcement.content}
                  </Typography>

                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={{ xs: 0.5, sm: 2 }}
                    sx={{ mt: 1.5 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Posted {formatDate(announcement.createdAt)}
                    </Typography>
                    {announcement.pg?.name ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <ApartmentIcon sx={{ fontSize: 14 }} color="action" />
                        <Typography variant="caption" color="text.secondary">
                          {announcement.pg.name}
                        </Typography>
                      </Stack>
                    ) : null}
                    {announcement.createdBy?.name ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <PersonIcon sx={{ fontSize: 14 }} color="action" />
                        <Typography variant="caption" color="text.secondary">
                          {announcement.createdBy.name}
                        </Typography>
                      </Stack>
                    ) : null}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </CardContent>
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
    </Box>
  );
}
