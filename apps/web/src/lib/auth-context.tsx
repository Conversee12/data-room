'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthResponse, LoginInput, RegisterInput, UserDto } from '@data-room/shared';

import { apiFetch, ApiRequestError } from './api';
import { session } from './session';

type Status = 'loading' | 'signed-in' | 'signed-out';

interface AuthValue {
  status: Status;
  user: UserDto | null;
  token: string | null;
  signIn: (input: LoginInput) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserDto | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const router = useRouter();
  const queryClient = useQueryClient();

  // A stored token is only a claim; it is verified against the API before the
  // app treats anyone as signed in, so a revoked or expired token cannot leave
  // the UI in a half-authenticated state.
  useEffect(() => {
    const stored = session.read();
    if (!stored) {
      setStatus('signed-out');
      return;
    }

    let cancelled = false;
    apiFetch<UserDto>('/auth/me', { token: stored })
      .then((me) => {
        if (cancelled) return;
        setToken(stored);
        setUser(me);
        setStatus('signed-in');
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiRequestError) session.clear();
        setStatus('signed-out');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const accept = useCallback((response: AuthResponse) => {
    session.write(response.token);
    setToken(response.token);
    setUser(response.user);
    setStatus('signed-in');
  }, []);

  const signIn = useCallback(
    async (input: LoginInput) => {
      accept(await apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: input }));
    },
    [accept],
  );

  const signUp = useCallback(
    async (input: RegisterInput) => {
      accept(await apiFetch<AuthResponse>('/auth/register', { method: 'POST', body: input }));
    },
    [accept],
  );

  const signOut = useCallback(() => {
    session.clear();
    setToken(null);
    setUser(null);
    setStatus('signed-out');
    // Cached folder contents belong to the person who just left.
    queryClient.clear();
    router.push('/login');
  }, [queryClient, router]);

  const value = useMemo<AuthValue>(
    () => ({ status, user, token, signIn, signUp, signOut }),
    [status, user, token, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
