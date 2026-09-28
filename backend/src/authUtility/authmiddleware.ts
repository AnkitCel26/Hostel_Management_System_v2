import { GraphQLError } from 'graphql';
import type { Request } from 'express';
import type { AuthUser, GraphQLContext } from '../types';
import { verifyToken } from '../utils/jwt';

function authError(message: string, code: string, status: number): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code, http: { status } }
  });
}

/**
 * Extracts the authenticated user from the access-token cookie, if valid.
 * Returns undefined for guests — never throws (invalid tokens degrade to guest).
 */
export function extractUserFromRequest(req: Request): AuthUser | undefined {
  const cookieName = process.env.JWT_COOKIE_NAME ?? 'hm_access';
  const token = req.cookies?.[cookieName];
  if (typeof token !== 'string' || token.length === 0) return undefined;

  const payload = verifyToken(token, 'access');
  return payload ? { id: payload.sub, role: payload.role } : undefined;
}

/** Requires any authenticated user. Returns the authenticated user. */
export function requireAuth(ctx: GraphQLContext): AuthUser {
  if (!ctx.user) {
    throw unauthenticated('You must be logged in to perform this action');
  }
  return ctx.user;
}

/** UNAUTHENTICATED error — the client's refresh link can rotate + retry on it. */
export function unauthenticated(message = 'Authentication required'): GraphQLError {
  return authError(message, 'UNAUTHENTICATED', 401);
}

/** Requires a specific role (Admin/Tenant boundaries stay separate). */
export function requireRole(ctx: GraphQLContext, role: AuthUser['role']): AuthUser {
  if (!ctx.user || ctx.user.role !== role) {
    throw authError(`This action requires the ${role} role`, 'FORBIDDEN', 403);
  }
  return ctx.user;
}

export function requireAdmin(ctx: GraphQLContext): AuthUser {
  return requireRole(ctx, 'Admin');
}

export function requireTenant(ctx: GraphQLContext): AuthUser {
  return requireRole(ctx, 'Tenant');
}
