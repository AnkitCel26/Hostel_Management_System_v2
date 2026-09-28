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
  InputAdornment,
  MenuItem,
  Stack,
  TextField
} from '@mui/material';

import {
  CREATE_ROOM_MUTATION,
  GET_ALL_PGS_ROOMS_QUERY,
  UPDATE_ROOM_MUTATION
} from '../../graphql/operations';
import type { Pg, Room } from '../../types';
import { getGraphQLErrorMessage } from '../../utils/errors';
import { PROPERTY_TERM } from '../../utils/labels';

// Limits mirror the backend room service validation (room.service.ts).
const roomSchema = z.object({
  pgId: z.string().min(1, `Select a ${PROPERTY_TERM.singularLower}`),
  roomNumber: z
    .string()
    .trim()
    .min(1, 'Room number is required')
    .max(20, 'Room number must be 20 characters or fewer'),
  roomType: z.string().trim().max(30, 'Room type must be 30 characters or fewer'),
  capacity: z
    .number({ invalid_type_error: 'Capacity is required' })
    .int('Capacity must be a whole number')
    .min(1, 'Capacity must be at least 1')
    .max(100, 'Capacity must be 100 or fewer'),
  rent: z
    .number({ invalid_type_error: 'Rent is required' })
    .int('Rent must be a whole number')
    .min(0, 'Rent cannot be negative')
    .max(10_000_000, 'Rent must be 10,000,000 or less'),
  // Optional: an empty field arrives as NaN and is treated as "not set".
  floor: z
    .union([
      z.nan(),
      z
        .number()
        .int('Floor must be a whole number')
        .min(0, 'Floor cannot be negative')
        .max(200, 'Floor must be 200 or fewer')
    ])
    .optional()
});

type RoomFormData = z.infer<typeof roomSchema>;

interface RoomFormDialogProps {
  open: boolean;
  /** The room being edited, or null to create a new one. */
  room: Room | null;
  /** PGs available for selection when creating a room. */
  pgs: Pg[];
  onClose: () => void;
  /** Called after a successful save; the parent shows feedback and refetches. */
  onSaved: (message: string) => void;
}

/**
 * Create/edit dialog for rooms (FR-09, FR-10). Rooms are always created under
 * a PG and cannot be moved between PGs, so the PG selector is only editable in
 * create mode. Occupancy is system-managed (FR-11) and is never editable here.
 */
export function RoomFormDialog({ open, room, pgs, onClose, onSaved }: RoomFormDialogProps) {
  const isEdit = room !== null;
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Apollo's cache updates Room entities by id, but it cannot insert a newly
  // created room into the cached Pg.rooms list of getAllPgsRooms — refetch it
  // so the Property Management page and the sidebar occupancy card stay fresh.
  const [createRoom] = useMutation(CREATE_ROOM_MUTATION, {
    refetchQueries: [{ query: GET_ALL_PGS_ROOMS_QUERY }]
  });
  const [updateRoom] = useMutation(UPDATE_ROOM_MUTATION, {
    refetchQueries: [{ query: GET_ALL_PGS_ROOMS_QUERY }]
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<RoomFormData>({
    resolver: zodResolver(roomSchema),
    defaultValues: { pgId: '', roomNumber: '', roomType: '', capacity: 1, rent: 0 }
  });

  // Load the record being edited (or blank defaults) each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setServerError(null);
      reset({
        pgId: room?.pg?.id ?? '',
        roomNumber: room?.roomNumber ?? '',
        roomType: room?.roomType ?? '',
        capacity: room?.capacity ?? 1,
        rent: room?.rent ?? 0,
        floor: room?.floor ?? undefined
      });
    }
  }, [open, room, reset]);

  const onSubmit = async (data: RoomFormData): Promise<void> => {
    setServerError(null);
    const floor = typeof data.floor === 'number' && !Number.isNaN(data.floor) ? data.floor : undefined;
    try {
      if (isEdit) {
        // Rooms cannot be moved between PGs: pgId is never sent on update.
        // roomType '' clears the value; floor omitted leaves it unchanged.
        await updateRoom({
          variables: {
            id: room.id,
            input: {
              roomNumber: data.roomNumber,
              roomType: data.roomType,
              capacity: data.capacity,
              rent: data.rent,
              floor
            }
          }
        });
        onSaved(`Room ${data.roomNumber} updated.`);
      } else {
        await createRoom({
          variables: {
            input: {
              pgId: data.pgId,
              roomNumber: data.roomNumber,
              roomType: data.roomType,
              capacity: data.capacity,
              rent: data.rent,
              floor
            }
          }
        });
        onSaved(`Room ${data.roomNumber} created.`);
      }
    } catch (error) {
      setServerError(getGraphQLErrorMessage(error, 'Unable to save the room. Please try again.'));
    }
  };

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Edit room' : 'Add room'}</DialogTitle>
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
                first, then add rooms to it.
              </Alert>
            ) : null}

            {isEdit ? (
              <TextField
                label={PROPERTY_TERM.singular}
                value={room.pg?.name ?? ''}
                InputProps={{ readOnly: true }}
                helperText={`Rooms cannot be moved between ${PROPERTY_TERM.pluralLower}.`}
              />
            ) : (
              <TextField
                select
                label={PROPERTY_TERM.singular}
                required
                error={!!errors.pgId}
                helperText={
                  errors.pgId?.message ??
                  `The ${PROPERTY_TERM.singularLower} this room belongs to`
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
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Room number"
                required
                autoFocus
                error={!!errors.roomNumber}
                helperText={errors.roomNumber?.message}
                {...register('roomNumber')}
              />
              <TextField
                label="Room type"
                placeholder="e.g. Single, Double, Shared"
                error={!!errors.roomType}
                helperText={errors.roomType?.message ?? 'Optional'}
                {...register('roomType')}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Capacity"
                required
                type="number"
                error={!!errors.capacity}
                helperText={
                  errors.capacity?.message ??
                  (isEdit && room.occupiedCount > 0
                    ? `${room.occupiedCount} tenant(s) assigned — capacity cannot go below that`
                    : 'Number of beds in this room')
                }
                inputProps={{ min: 1, max: 100, step: 1 }}
                {...register('capacity', { valueAsNumber: true })}
              />
              <TextField
                label="Monthly rent"
                required
                type="number"
                error={!!errors.rent}
                helperText={errors.rent?.message}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>
                }}
                inputProps={{ min: 0, max: 10_000_000, step: 1 }}
                {...register('rent', { valueAsNumber: true })}
              />
            </Stack>

            <TextField
              label="Floor"
              type="number"
              error={!!errors.floor}
              helperText={errors.floor?.message ?? 'Optional — 0 is the ground floor'}
              inputProps={{ min: 0, max: 200, step: 1 }}
              {...register('floor', { valueAsNumber: true })}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting || (!isEdit && pgs.length === 0)}>
            {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create room'}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
