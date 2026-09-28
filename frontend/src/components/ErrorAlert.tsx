import { Alert, AlertTitle } from '@mui/material';

interface ErrorAlertProps {
  message?: string | null;
  title?: string;
}

/** Consistent error state display (UI/UX design system). */
export function ErrorAlert({ message, title }: ErrorAlertProps) {
  if (!message) return null;
  return (
    <Alert severity="error" role="alert">
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      {message}
    </Alert>
  );
}
