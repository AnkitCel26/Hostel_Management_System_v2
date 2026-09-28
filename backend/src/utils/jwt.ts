import * as jwt from 'jsonwebtoken';

export type AuthRole = 'Admin' | 'Tenant';
export type TokenType = 'access' | 'refresh';

export interface TokenPayload {
  sub: string; // user id
  role: AuthRole;
  type: TokenType;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'replace_me') {
    throw new Error('JWT_SECRET must be configured with a real secret value');
  }
  return secret;
}

function readTtlSeconds(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getAccessTtlSeconds(): number {
  return readTtlSeconds('JWT_ACCESS_TTL_SECONDS', 900);
}

export function getRefreshTtlSeconds(): number {
  return readTtlSeconds('JWT_REFRESH_TTL_SECONDS', 2592000);
}

export function signAccessToken(userId: string, role: AuthRole): string {
  return jwt.sign({ sub: userId, role, type: 'access' }, getSecret(), {
    expiresIn: getAccessTtlSeconds()
  });
}

export function signRefreshToken(userId: string, role: AuthRole): string {
  return jwt.sign({ sub: userId, role, type: 'refresh' }, getSecret(), {
    expiresIn: getRefreshTtlSeconds()
  });
}

/**
 * Verifies a token's signature and its expected type.
 * Returns null for any invalid/expired/mistyped token — never throws,
 * so request handling can degrade to "guest" instead of erroring.
 */
export function verifyToken(token: string, expectedType: TokenType): TokenPayload | null {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, getSecret());
  } catch {
    return null;
  }

  if (typeof decoded === 'string' || decoded === null) return null;

  const { sub, role, type } = decoded as Record<string, unknown>;
  if (typeof sub !== 'string') return null;
  if (role !== 'Admin' && role !== 'Tenant') return null;
  if (type !== 'access' && type !== 'refresh') return null;
  if (type !== expectedType) return null;

  return { sub, role, type };
}
