import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from '@mui/material';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** True while the confirmed action is running — blocks closing. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText variant="body2">{message}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={destructive ? 'error' : 'primary'}
          autoFocus
          disabled={busy}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
