import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Stack, TextField } from '@mui/material';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';

import { AuthLayout } from '../../components/AuthLayout';
import { useAuth } from '../../context/AuthContext';
import { getGraphQLErrorMessage } from '../../utils/errors';
import { getHomePath } from '../../utils/navigation';

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password')
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { user, loading, register: registerAccount } = useAuth();
  const navigate = useNavigate();

  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' }
  });

  // Already logged in? Go straight to the right portal.
  React.useEffect(() => {
    if (!loading && user) {
      navigate(getHomePath(user.role), { replace: true });
    }
  }, [loading, user, navigate]);

  const onSubmit = async (data: RegisterFormData): Promise<void> => {
    setServerError(null);
    try {
      const created = await registerAccount({
        name: data.name.trim(),
        email: data.email,
        password: data.password
      });
      navigate(getHomePath(created.role), { replace: true });
    } catch (error) {
      setServerError(getGraphQLErrorMessage(error, 'Unable to register. Please try again.'));
    }
  };

  return (
    <AuthLayout
      icon={<PersonAddAlt1Icon />}
      title="Create your account"
      subtitle="Register to access your tenant portal."
      footerText="Already have an account?"
      footerLinkLabel="Login"
      footerLinkTo="/login"
    >
      <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        {serverError ? (
          <Alert severity="error" role="alert">
            {serverError}
          </Alert>
        ) : null}

        <TextField
          label="Full name"
          required
          autoFocus
          autoComplete="name"
          error={!!errors.name}
          helperText={errors.name?.message}
          {...register('name')}
        />

        <TextField
          label="Email"
          type="email"
          required
          autoComplete="email"
          error={!!errors.email}
          helperText={errors.email?.message}
          {...register('email')}
        />

        <TextField
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          error={!!errors.password}
          helperText={errors.password?.message ?? 'At least 8 characters'}
          {...register('password')}
        />

        <TextField
          label="Confirm password"
          type="password"
          required
          autoComplete="new-password"
          error={!!errors.confirmPassword}
          helperText={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          disabled={isSubmitting || loading}
        >
          {isSubmitting ? 'Creating account…' : 'Register'}
        </Button>
      </Stack>
    </AuthLayout>
  );
}
