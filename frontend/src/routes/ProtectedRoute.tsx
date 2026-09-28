import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { LoadingIndicator } from '../components/LoadingIndicator';
import { useAuth } from '../context/AuthContext';
import { getHomePath } from '../utils/navigation';
import type { UserRole } from '../types';

interface RequireAuthProps {
  children: ReactNode;
}

/** Blocks the route for guests, remembering where the user wanted to go. */
export function RequireAuth({ children }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingIndicator />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

interface RequireRoleProps extends RequireAuthProps {
  role: UserRole;
}

/** Blocks the route for other roles and sends users to their own portal. */
export function RequireRole({ role, children }: RequireRoleProps) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingIndicator />;
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== role) {
    return <Navigate to={getHomePath(user.role)} replace />;
  }
  return <>{children}</>;
}
