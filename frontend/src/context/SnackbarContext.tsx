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
  notify: (message: string, severity?: AlertColor) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined);

const AUTO_HIDE_MS = 3500;

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
