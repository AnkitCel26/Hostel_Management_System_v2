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
  MenuItem,
  Stack,
  TextField
} from '@mui/material';

import {
  CREATE_TENANT_MUTATION,
  GET_ALL_PGS_ROOMS_QUERY,
  GET_ALL_USERS_QUERY,
  UPDATE_TENANT_MUTATION
} from '../../graphql/operations';
import type { AdminUser, Pg, Tenant, UpdateTenantInput } from '../../types';
import { getGraphQLErrorMessage } from '../../utils/errors';
import { PROPERTY_TERM } from '../../utils/labels';

// Limits mirror the backend tenant service validation (tenant.service.ts).
const tenantSchema = z.object({
  userId: z.string().min(1, 'Select a user account'),
  pgId: z.string().min(1, `Select a ${PROPERTY_TERM.singularLower}`),
  // '' means "no room assigned".
  roomId: z.string(),
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Name must be 120 characters or fewer'),
  phone: z.string().trim().max(20, 'Phone must be 20 characters or fewer'),
  emergencyContact: z
    .string()
    .trim()
    .max(120, 'Emergency contact must be 120 characters or fewer'),
  // The native date input yields '' or YYYY-MM-DD; the backend re-validates
  // that the value is a real calendar date.
  joinDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
});

type TenantFormData = z.infer<typeof tenantSchema>;

interface TenantFormDialogProps {
  open: boolean;
  /** The tenant being edited, or null to create a new one. */
  tenant: Tenant | null;
  /** Properties with their rooms (getAllPgsRooms) for the cascaded room picker. */
  pgs: Pg[];
  /** All users (allUsers); only unlinked Tenant-role accounts are offered on create. */
  users: AdminUser[];
  onClose: () => void;
  /** Called after a successful save; the parent shows feedback and refetches. */
  onSaved: (message: string) => void;
}

/**
 * Create/edit dialog for tenants (FR-13, FR-14, FR-15). A tenant record links
 * an existing Tenant-role user to a property, with an optional room
 * assignment; edit mode also supports room reassignment and moving the tenant
 * to another property. Occupancy is updated transactionally by the backend
 * (FR-16) and is never editable here.
 */
export function TenantFormDialog({
  open,
  tenant,
  pgs,
  users,
  onClose,
  onSaved
}: TenantFormDialogProps) {
  const isEdit = tenant !== null;
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Room assignment moves room.occupiedCount, which Apollo cannot merge into
  // the cached getAllPgsRooms PG.rooms lists — refetch it so the Property and
  // Room Management pages and the sidebar occupancy card stay fresh. Creating
  // a tenant also consumes a linkable user account, so the user list is
  // refetched as well.
  const [createTenant] = useMutation(CREATE_TENANT_MUTATION, {
    refetchQueries: [{ query: GET_ALL_PGS_ROOMS_QUERY }, { query: GET_ALL_USERS_QUERY }]
  });
  const [updateTenant] = useMutation(UPDATE_TENANT_MUTATION, {
    refetchQueries: [{ query: GET_ALL_PGS_ROOMS_QUERY }]
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<TenantFormData>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      userId: '',
      pgId: '',
      roomId: '',
      name: '',
      phone: '',
      emergencyContact: '',
      joinDate: ''
    }
  });

  // Load the record being edited (or blank defaults) each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setServerError(null);
      reset({
        userId: tenant?.user?.id ?? '',
        pgId: tenant?.pg?.id ?? '',
        roomId: tenant?.room?.id ?? '',
        name: tenant?.name ?? '',
        phone: tenant?.phone ?? '',
        emergencyContact: tenant?.emergencyContact ?? '',
        joinDate: tenant?.joinDate ?? ''
      });
    }
  }, [open, tenant, reset]);

  const selectedPgId = watch('pgId');
  const selectedRoomId = watch('roomId');

  // Rooms of the currently selected property, feeding the cascaded room picker.
  const roomsForPg = React.useMemo(
    () => pgs.find((pg) => pg.id === selectedPgId)?.rooms ?? [],
    [pgs, selectedPgId]
  );

  // Only unlinked Tenant-role accounts can back a new tenant record (User 1 ─ 0..1 Tenant).
  const linkableUsers = React.useMemo(
    () => users.filter((user) => user.role === 'Tenant' && !user.tenant),
    [users]
  );

  // A room stays selected only while it belongs to the selected property —
  // moving the tenant to another property resets the assignment (the backend
  // rejects keeping a room from the old property).
  React.useEffect(() => {
    if (selectedRoomId !== '' && !roomsForPg.some((room) => room.id === selectedRoomId)) {
      setValue('roomId', '');
    }
  }, [selectedRoomId, roomsForPg, setValue]);

  const onSubmit = async (data: TenantFormData): Promise<void> => {
    setServerError(null);
    try {
      if (isEdit) {
        // Update semantics: '' clears an optional field. roomId is always sent
        // explicitly ('' → null unassigns) so a property move never silently
        // keeps a room from the old property. The linked user never changes.
        const input: UpdateTenantInput = {
          name: data.name,
          phone: data.phone,
          emergencyContact: data.emergencyContact,
          joinDate: data.joinDate,
          pgId: data.pgId,
          roomId: data.roomId === '' ? null : data.roomId
        };
        await updateTenant({ variables: { id: tenant.id, input } });
        onSaved(`Tenant ${data.name} updated.`);
      } else {
        await createTenant({
          variables: {
            input: {
              userId: data.userId,
              pgId: data.pgId,
              roomId: data.roomId === '' ? undefined : data.roomId,
              name: data.name,
              phone: data.phone === '' ? undefined : data.phone,
              emergencyContact: data.emergencyContact === '' ? undefined : data.emergencyContact,
              joinDate: data.joinDate === '' ? undefined : data.joinDate
            }
          }
        });
        onSaved(`Tenant ${data.name} created.`);
      }
    } catch (error) {
      setServerError(getGraphQLErrorMessage(error, 'Unable to save the tenant. Please try again.'));
    }
  };

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Edit tenant' : 'Add tenant'}</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit(onSubmit)} noValidate spacing={0}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {serverError ? (
              <Alert severity="error" role="alert">
                {serverError}
              </Alert>
            ) : null}

            {!isEdit && linkableUsers.length === 0 ? (
              <Alert severity="info">
                No unlinked tenant user accounts are available. Register a tenant account first,
                then create the tenant record for it.
              </Alert>
            ) : null}
            {!isEdit && pgs.length === 0 ? (
              <Alert severity="info">
                No {PROPERTY_TERM.pluralLower} exist yet. Create a {PROPERTY_TERM.singularLower}{' '}
                first, then add tenants to it.
              </Alert>
            ) : null}

            {isEdit ? (
              <TextField
                label="User account"
                value={tenant.user?.email ?? ''}
                InputProps={{ readOnly: true }}
                helperText="The user account linked to this tenant record."
              />
            ) : (
              <TextField
                select
                label="User account"
                required
                error={!!errors.userId}
                helperText={
                  errors.userId?.message ??
                  'Only tenant-role accounts without a tenant record are listed'
                }
                inputProps={{ 'aria-label': 'Select a user account' }}
                {...register('userId')}
              >
                {linkableUsers.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name} · {user.email}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              label="Full name"
              required
              autoFocus
              error={!!errors.name}
              helperText={errors.name?.message}
              {...register('name')}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Phone"
                type="tel"
                error={!!errors.phone}
                helperText={errors.phone?.message ?? 'Optional'}
                {...register('phone')}
              />
              <TextField
                label="Emergency contact"
                error={!!errors.emergencyContact}
                helperText={errors.emergencyContact?.message ?? 'Optional'}
                {...register('emergencyContact')}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label={PROPERTY_TERM.singular}
                required
                error={!!errors.pgId}
                helperText={
                  errors.pgId?.message ??
                  (isEdit
                    ? `Moving to another ${PROPERTY_TERM.singularLower} clears the room assignment`
                    : `The ${PROPERTY_TERM.singularLower} this tenant lives in`)
                }
                inputProps={{ 'aria-label': `Select a ${PROPERTY_TERM.singularLower}` }}
                {...register('pgId')}
              >
                {pgs.map((pg) => (
                  <MenuItem key={pg.id} value={pg.id}>
                    {pg.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Room"
                error={!!errors.roomId}
                helperText={
                  selectedPgId !== '' && roomsForPg.length === 0
                    ? `No rooms in this ${PROPERTY_TERM.singularLower} yet`
                    : 'Optional — a free bed is verified on save'
                }
                inputProps={{ 'aria-label': 'Select a room' }}
                {...register('roomId')}
              >
                <MenuItem value="">No room assigned</MenuItem>
                {roomsForPg.map((room) => {
                  const isFull = room.occupiedCount >= room.capacity;
                  // The tenant's current room stays selectable even when full.
                  const isCurrent = tenant?.room?.id === room.id;
                  return (
                    <MenuItem key={room.id} value={room.id} disabled={isFull && !isCurrent}>
                      {room.roomNumber} · {room.occupiedCount}/{room.capacity} beds
                      {isFull && !isCurrent ? ' — full' : ''}
                    </MenuItem>
                  );
                })}
              </TextField>
            </Stack>

            <TextField
              label="Join date"
              type="date"
              InputLabelProps={{ shrink: true }}
              error={!!errors.joinDate}
              helperText={errors.joinDate?.message ?? 'Optional'}
              {...register('joinDate')}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={
              isSubmitting || (!isEdit && (linkableUsers.length === 0 || pgs.length === 0))
            }
          >
            {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create tenant'}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
