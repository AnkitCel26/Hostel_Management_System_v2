import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Stack, TextField } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';

import { AuthLayout } from '../../components/AuthLayout';
import { useAuth } from '../../context/AuthContext';
import { getGraphQLErrorMessage } from '../../utils/errors';
import { getHomePath } from '../../utils/navigation';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required')
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  // Already logged in? Go straight to the right portal.
  React.useEffect(() => {
    if (!loading && user) {
      navigate(from ?? getHomePath(user.role), { replace: true });
    }
  }, [loading, user, from, navigate]);

  const onSubmit = async (data: LoginFormData): Promise<void> => {
    setServerError(null);
    try {
      const loggedIn = await login(data);
      navigate(from ?? getHomePath(loggedIn.role), { replace: true });
    } catch (error) {
      setServerError(getGraphQLErrorMessage(error, 'Unable to log in. Please try again.'));
    }
  };

  return (
    <AuthLayout
      icon={<LoginIcon />}
      title="Welcome back"
      subtitle="Sign in to access your dashboard."
      footerText="Don&apos;t have an account?"
      footerLinkLabel="Register"
      footerLinkTo="/register"
    >
      <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        {serverError ? (
          <Alert severity="error" role="alert">
            {serverError}
          </Alert>
        ) : null}

        <TextField
          label="Email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          error={!!errors.email}
          helperText={errors.email?.message}
          {...register('email')}
        />

        <TextField
          label="Password"
          type="password"
          required
          autoComplete="current-password"
          error={!!errors.password}
          helperText={errors.password?.message}
          {...register('password')}
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          disabled={isSubmitting || loading}
        >
          {isSubmitting ? 'Logging in…' : 'Login'}
        </Button>
      </Stack>
    </AuthLayout>
  );
}
