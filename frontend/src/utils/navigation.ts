import type { UserRole } from '../types';

/** Portal home per role (Admin and Tenant boundaries stay separate). */
export function getHomePath(role: UserRole): string {
  return role === 'Admin' ? '/admin/dashboard' : '/tenant/dashboard';
}
