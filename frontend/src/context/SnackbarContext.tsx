import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import type { AlertColor } from '@mui/material';

interface SnackbarState {
  open: boolean;
  message: string;
  severity: AlertColor;
  /** Bumped on every notification so rapid updates restart the hide timer. */
  key: number;
}

interface SnackbarContextValue {
  /** Show a toast with an explicit severity (defaults to success). */
  notify: (message: string, severity?: AlertColor) => void;
  /** Success feedback after a create/update operation. */
  success: (message: string) => void;
  /** Non-blocking error feedback (form-field errors stay inline). */
  error: (message: string) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined);

/** Toasts vanish automatically after ~3.5 seconds. */
const AUTO_HIDE_MS = 3500;

/**
 * App-wide snackbar for mutation feedback (MRD forms rule: "Show
 * success/error feedback"). Any page can call `useSnackbar().success(...)`
 * after something is created or updated; the toast shows for 3–4 seconds and
 * then vanishes automatically.
 */
export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success',
    key: 0
  });

  const notify = useCallback((message: string, severity: AlertColor = 'success') => {
    setState((prev) => ({ open: true, message, severity, key: prev.key + 1 }));
  }, []);

  const success = useCallback((message: string) => notify(message, 'success'), [notify]);
  const error = useCallback((message: string) => notify(message, 'error'), [notify]);

  const handleClose = (_event: unknown, reason?: string): void => {
    // Ignore click-away so the message stays readable for its full duration.
    if (reason === 'clickaway') return;
    setState((prev) => ({ ...prev, open: false }));
  };

  const value = useMemo<SnackbarContextValue>(() => ({ notify, success, error }), [notify, success, error]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        key={state.key}
        open={state.open}
        autoHideDuration={AUTO_HIDE_MS}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={state.severity} variant="filled" onClose={handleClose}>
          {state.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarContextValue {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used inside a SnackbarProvider');
  }
  return context;
}
