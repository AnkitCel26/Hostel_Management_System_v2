import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';

import {
  LOGIN_MUTATION,
  LOGOUT_MUTATION,
  ME_QUERY,
  REGISTER_MUTATION,
  UPDATE_PROFILE_MUTATION
} from '../graphql/operations';
import type {
  AuthUser,
  LoginInput,
  RegisterInput,
  UpdateProfileInput
} from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useApolloClient();
  const { data, loading } = useQuery(ME_QUERY);
  const user: AuthUser | null = data?.me ?? null;

  const [loginMutation] = useMutation(LOGIN_MUTATION);
  const [registerMutation] = useMutation(REGISTER_MUTATION);
  const [logoutMutation] = useMutation(LOGOUT_MUTATION);
  const [updateProfileMutation] = useMutation(UPDATE_PROFILE_MUTATION);

  const writeUser = useCallback(
    (nextUser: AuthUser | null) => {
      client.writeQuery({ query: ME_QUERY, data: { me: nextUser } });
    },
    [client]
  );

  const login = useCallback(
    async (input: LoginInput): Promise<AuthUser> => {
      const result = await loginMutation({ variables: { input } });
      const nextUser = result.data?.loginUser as AuthUser | undefined;
      if (!nextUser) throw new Error('Login failed');
      writeUser(nextUser);
      return nextUser;
    },
    [loginMutation, writeUser]
  );

  const register = useCallback(
    async (input: RegisterInput): Promise<AuthUser> => {
      const result = await registerMutation({ variables: { input } });
      const nextUser = result.data?.registerUser as AuthUser | undefined;
      if (!nextUser) throw new Error('Registration failed');
      writeUser(nextUser);
      return nextUser;
    },
    [registerMutation, writeUser]
  );

  const logout = useCallback(async (): Promise<void> => {
    await logoutMutation();
    writeUser(null);
    // Clears all cached data (including role-scoped content) and refetches `me`.
    await client.resetStore();
  }, [client, logoutMutation, writeUser]);

  const updateProfile = useCallback(
    async (input: UpdateProfileInput): Promise<AuthUser> => {
      const result = await updateProfileMutation({ variables: { input } });
      const nextUser = result.data?.updateProfile as AuthUser | undefined;
      if (!nextUser) throw new Error('Profile update failed');
      writeUser(nextUser);
      return nextUser;
    },
    [updateProfileMutation, writeUser]
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, updateProfile }),
    [user, loading, login, register, logout, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
