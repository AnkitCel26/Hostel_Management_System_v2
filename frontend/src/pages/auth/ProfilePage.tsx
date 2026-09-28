import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EditIcon from '@mui/icons-material/Edit';
import EmailIcon from '@mui/icons-material/Email';
import HistoryIcon from '@mui/icons-material/History';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import ShieldIcon from '@mui/icons-material/Shield';

import { LoadingIndicator } from '../../components/LoadingIndicator';
import { useAuth } from '../../context/AuthContext';
import { useSnackbar } from '../../context/SnackbarContext';
import type { AuthUser } from '../../types';
import { getGraphQLErrorMessage } from '../../utils/errors';
import { formatDate, getInitials } from '../../utils/format';

// Limits mirror the backend auth service validation (auth.service.ts).
const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  phone: z.string().trim().max(20, 'Phone must be 20 characters or fewer')
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface EditProfileDialogProps {
  open: boolean;
  user: AuthUser;
  onClose: () => void;
}

/** Edit-profile dialog: opened from the edit icon on the profile card. */
function EditProfileDialog({ open, user, onClose }: EditProfileDialogProps) {
  const { updateProfile } = useAuth();
  const { success } = useSnackbar();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, phone: user.phone ?? '' }
  });

  // Load the current values each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setServerError(null);
      reset({ name: user.name, phone: user.phone ?? '' });
    }
  }, [open, user, reset]);

  const onSubmit = async (data: ProfileFormData): Promise<void> => {
    setServerError(null);
    try {
      await updateProfile({
        name: data.name,
        phone: data.phone === '' ? null : data.phone
      });
      onClose();
      success('Profile updated successfully.');
    } catch (error) {
      setServerError(getGraphQLErrorMessage(error, 'Unable to update profile.'));
    }
  };

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Edit profile</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit(onSubmit)} noValidate spacing={0}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {serverError ? (
              <Alert severity="error" role="alert">
                {serverError}
              </Alert>
            ) : null}
            <TextField
              label="Full name"
              required
              autoFocus
              error={!!errors.name}
              helperText={errors.name?.message}
              {...register('name')}
            />
            <TextField
              label="Phone"
              error={!!errors.phone}
              helperText={errors.phone?.message ?? 'Optional'}
              {...register('phone')}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}

interface DetailItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

/** One labeled fact with the homepage's tinted icon-badge styling. */
function DetailItem({ icon, label, value }: DetailItemProps) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'primary.main',
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1)
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" display="block">
          {label}
        </Typography>
        <Typography variant="body2" fontWeight={600} noWrap>
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}

/**
 * Profile page (/profile): identity header card with edit + logout actions
 * (no separate edit section — editing happens in a dialog), followed by an
 * account-details grid.
 */
export function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = React.useState(false);

  if (loading) {
    return <LoadingIndicator />;
  }

  if (!user) {
    // RequireAuth normally prevents this; kept as a safe fallback.
    return null;
  }

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  const iconButtonSx = {
    border: 1,
    borderColor: 'divider',
    borderRadius: 2,
    bgcolor: 'background.paper'
  } as const;

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>
      {/* Identity header */}
      <Card>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2.5}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
          >
            <Avatar
              sx={{
                width: 72,
                height: 72,
                bgcolor: 'primary.main',
                fontSize: '1.75rem',
                fontWeight: 600
              }}
            >
              {getInitials(user.name)}
            </Avatar>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h5" component="h1" noWrap>
                {user.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {user.email}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
                <Chip
                  label={user.role === 'Admin' ? 'Administrator' : 'Tenant'}
                  color={user.role === 'Admin' ? 'secondary' : 'primary'}
                  size="small"
                />
                <Chip
                  icon={<CalendarTodayIcon />}
                  label={`Member since ${formatDate(user.createdAt)}`}
                  size="small"
                  variant="outlined"
                />
              </Stack>
            </Box>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Edit profile">
                <IconButton
                  aria-label="Edit profile"
                  onClick={() => setEditOpen(true)}
                  sx={iconButtonSx}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Log out">
                <IconButton
                  aria-label="Log out"
                  color="error"
                  onClick={() => void handleLogout()}
                  sx={iconButtonSx}
                >
                  <LogoutIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Account details */}
      <Card sx={{ mt: 3 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Typography variant="h6" component="h2" gutterBottom>
            Account details
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Your personal and account information. Use the edit icon above to make changes.
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 3
            }}
          >
            <DetailItem icon={<PersonIcon fontSize="small" />} label="Full name" value={user.name} />
            <DetailItem icon={<EmailIcon fontSize="small" />} label="Email" value={user.email} />
            <DetailItem
              icon={<PhoneIcon fontSize="small" />}
              label="Phone"
              value={user.phone ?? 'Not provided'}
            />
            <DetailItem
              icon={<ShieldIcon fontSize="small" />}
              label="Role"
              value={user.role === 'Admin' ? 'Administrator' : 'Tenant'}
            />
            <DetailItem
              icon={<CalendarTodayIcon fontSize="small" />}
              label="Member since"
              value={formatDate(user.createdAt)}
            />
            <DetailItem
              icon={<HistoryIcon fontSize="small" />}
              label="Last updated"
              value={formatDate(user.updatedAt)}
            />
          </Box>
        </CardContent>
      </Card>

      <EditProfileDialog open={editOpen} user={user} onClose={() => setEditOpen(false)} />
    </Box>
  );
}
