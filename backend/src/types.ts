import type { Request, Response } from 'express';

export type AuthRole = 'Admin' | 'Tenant';

export type AuthUser = {
  id: string;
  role: AuthRole;
};

export type GraphQLContext = {
  req: Request;
  res: Response;
  user?: AuthUser;
};
