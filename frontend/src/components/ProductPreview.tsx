import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import PersonIcon from '@mui/icons-material/Person';

const PREVIEW_STATS = [
  { label: 'Total Rooms', value: '120' },
  { label: 'Occupied', value: '96' },
  { label: 'Pending Dues', value: '8' },
  { label: 'Open Complaints', value: '3' }
];

const PREVIEW_ROWS = [
  { name: 'Aarav Sharma', room: 'A-101', status: 'Paid', tone: 'success' },
  { name: 'Priya Nair', room: 'B-204', status: 'Pending', tone: 'warning' },
  { name: 'Rahul Verma', room: 'C-310', status: 'Overdue', tone: 'error' }
] as const;

export function ProductPreview() {
  return (
    <Card aria-hidden="true" sx={{ display: { xs: 'none', md: 'block' }, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 2.5,
          py: 1.75,
          borderBottom: 1,
          borderColor: 'divider'
        }}
      >
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main' }} />
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'warning.main' }} />
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'success.main' }} />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          Admin Dashboard — overview
        </Typography>
      </Box>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
          {PREVIEW_STATS.map((stat) => (
            <Box key={stat.label} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.default' }}>
              <Typography variant="h5" component="p" fontWeight={700}>
                {stat.value}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {stat.label}
              </Typography>
            </Box>
          ))}
        </Box>
        <Stack spacing={1.25} sx={{ mt: 2.5 }}>
          {PREVIEW_ROWS.map((row) => (
            <Box
              key={row.room}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1.25,
                borderRadius: 2,
                border: 1,
                borderColor: 'divider'
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: 'primary.main',
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1)
                }}
              >
                <PersonIcon fontSize="small" />
              </Box>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {row.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Room {row.room}
                </Typography>
              </Box>
              <Chip label={row.status} color={row.tone} size="small" variant="outlined" />
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
