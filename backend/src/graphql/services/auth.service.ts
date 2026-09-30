import { GraphQLError } from 'graphql';
import type { Request, Response } from 'express';
import { AppDataSource } from '../../config/db';
import { User, UserRole } from '../../entities/user.entity';
import { hashPassword, verifyPassword } from '../../utils/password';
import {
  getAccessTtlSeconds,
  getRefreshTtlSeconds,
  signAccessToken,
  signRefreshToken,
  verifyToken
} from '../../utils/jwt';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  name?: string | null;
  phone?: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function userRepo() {
  return AppDataSource.getRepository(User);
}

function badRequest(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } }
  });
}

function unauthenticated(message = 'Authentication required'): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } }
  });
}

function authCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // site), so 'lax' works in dev. Production should serve app + API on one
    // domain, or this must become 'none' with secure cookies.
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds * 1000
  };
}

function setAuthCookies(res: Response, user: User): void {
  res.cookie(
    process.env.JWT_COOKIE_NAME ?? 'hm_access',
    signAccessToken(user.id, user.role),
    authCookieOptions(getAccessTtlSeconds())
  );
  res.cookie(
    process.env.JWT_REFRESH_COOKIE_NAME ?? 'hm_refresh',
    signRefreshToken(user.id, user.role),
    authCookieOptions(getRefreshTtlSeconds())
  );
}

function clearAuthCookies(res: Response): void {
  const base = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
  res.clearCookie(process.env.JWT_COOKIE_NAME ?? 'hm_access', base);
  res.clearCookie(process.env.JWT_REFRESH_COOKIE_NAME ?? 'hm_refresh', base);
}

let dummyHash: string | null = null;

async function equalizeLoginTiming(password: string): Promise<boolean> {
  dummyHash ??= await hashPassword('timing-equalizer-placeholder');
  return verifyPassword(password, dummyHash);
}

function assertValidRegistration(input: RegisterInput): void {
  if (!input.name || input.name.trim().length < 2) {
    throw badRequest('Name must be at least 2 characters');
  }
  if (!input.email || !EMAIL_REGEX.test(input.email.trim())) {
    throw badRequest('A valid email is required');
  }
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

export async function registerUser(input: RegisterInput, res: Response): Promise<User> {
  assertValidRegistration(input);

  const email = input.email.trim().toLowerCase();
  const existing = await userRepo().findOne({ where: { email } });
  if (existing) {
    throw badRequest('An account with this email already exists');
  }

  const user = await userRepo().save(
    userRepo().create({
      name: input.name.trim(),
      email,
      password: await hashPassword(input.password),
      role: UserRole.Tenant
    })
  );

  setAuthCookies(res, user);
  return user;
}

export async function loginUser(input: LoginInput, res: Response): Promise<User> {
  const email = (input.email ?? '').trim().toLowerCase();
  const password = input.password ?? '';

  const user = await userRepo()
    .createQueryBuilder('user')
    .addSelect('user.password')
    .where('user.email = :email', { email })
    .getOne();

  const passwordValid = user
    ? await verifyPassword(password, user.password)
    : await equalizeLoginTiming(password);

  if (!user || !passwordValid) {
    throw new GraphQLError('Invalid email or password', {
      extensions: { code: 'INVALID_CREDENTIALS', http: { status: 401 } }
    });
  }

  setAuthCookies(res, user);
  return user;
}

export async function logoutUser(res: Response): Promise<boolean> {
  clearAuthCookies(res);
  return true;
}

export async function refreshUserSession(req: Request, res: Response): Promise<User> {
  const cookieName = process.env.JWT_REFRESH_COOKIE_NAME ?? 'hm_refresh';
  const token = req.cookies?.[cookieName];

  if (typeof token !== 'string' || token.length === 0) {
    throw unauthenticated('No refresh token present');
  }

  const payload = verifyToken(token, 'refresh');
  if (!payload) {
    clearAuthCookies(res);
    throw unauthenticated('Refresh token is invalid or expired');
  }

  const user = await userRepo().findOne({ where: { id: payload.sub } });
  if (!user) {
    clearAuthCookies(res);
    throw unauthenticated('Account no longer exists');
  }

  setAuthCookies(res, user);
  return user;
}

export async function getCurrentUser(userId: string): Promise<User | null> {
  return userRepo().findOne({ where: { id: userId }, relations: { tenant: true } });
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput
): Promise<User> {
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) {
    throw unauthenticated('Account no longer exists');
  }

  if (input.name !== undefined && input.name !== null) {
    const name = input.name.trim();
    if (name.length < 2) {
      throw badRequest('Name must be at least 2 characters');
    }
    user.name = name;
  }

  if (input.phone !== undefined && input.phone !== null) {
    const phone = input.phone.trim();
    if (phone.length > 20) {
      throw badRequest('Phone must be 20 characters or fewer');
    }
    user.phone = phone.length === 0 ? null : phone;
  }

  return userRepo().save(user);
}

export async function getAllUsers(): Promise<User[]> {
  return userRepo().find({ order: { createdAt: 'DESC' } });
}
