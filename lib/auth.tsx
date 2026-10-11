'use client';

// lib/auth.tsx
//
// Auth context for the whole app. Wraps <body> children in app/layout.tsx.
//
// Responsibilities:
//   1. Persist / read the JWT (via helpers from lib/api.ts).
//   2. Validate the token on app boot by calling GET /api/auth/me.
//   3. Expose login / register / logout to pages.
//   4. React to `auth:unauthorized` events emitted by lib/api.ts on 401.
//   5. Provide a <RequireAuth> guard for role-gated pages.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import {
  api,
  clearToken,
  getToken,
  setToken,
} from '@/lib/api';
import type {
  LoginRequest,
  RegisterRequest,
  Role,
  User,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────────────────────────────────────

type AuthContextValue = {
  user: User | null;
  token: string | null;
  /** True while the initial /auth/me bootstrap is in flight. */
  loading: boolean;
  login: (creds: LoginRequest) => Promise<User>;
  register: (data: RegisterRequest) => Promise<User>;
  /** Pass redirect=false to skip the /login navigation (e.g. from a nested screen). */
  logout: (redirect?: boolean) => void;
  /** Refetch the current user (e.g. after profile edits). */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Bootstrap: read token from localStorage and validate it once. ──────────
  useEffect(() => {
    const controller = new AbortController();
    const stored = getToken();

    if (!stored) {
      setLoading(false);
      return () => controller.abort();
    }

    setTokenState(stored);

    api.auth
      .me({ signal: controller.signal })
      .then((res) => {
        setUser(res.user);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Invalid / expired token — clean slate.
        clearToken();
        setTokenState(null);
        setUser(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  // ── React to 401s from lib/api.ts ──────────────────────────────────────────
  useEffect(() => {
    function onUnauthorized() {
      clearToken();
      setTokenState(null);
      setUser(null);

      if (typeof window === 'undefined') return;
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/register') {
        router.push('/login');
      }
    }

    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [router]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const login = useCallback(async (creds: LoginRequest) => {
    const res = await api.auth.login(creds);
    setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (data: RegisterRequest) => {
    const res = await api.auth.register(data);
    setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(
    (redirect = true) => {
      clearToken();
      setTokenState(null);
      setUser(null);
      if (redirect) router.push('/login');
    },
    [router],
  );

  const refresh = useCallback(async () => {
    const res = await api.auth.me();
    setUser(res.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, register, logout, refresh }),
    [user, token, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard component — wrap protected pages.
//
//   <RequireAuth allow="lecturer"> …page… </RequireAuth>
//   <RequireAuth>              …any logged-in role… </RequireAuth>
//
// While the bootstrap is in flight it renders a full-screen loader instead
// of blanking (prevents a flash-of-login on refresh).
// ─────────────────────────────────────────────────────────────────────────────

export function RequireAuth({
  allow,
  children,
}: {
  allow?: Role | Role[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Normalize `allow` to a stable array so the effect doesn't refire on
  // every render when the caller passes an inline array literal.
  const allowKey = Array.isArray(allow)
    ? allow.slice().sort().join(',')
    : (allow ?? '');
  const allowed = useMemo<Role[] | null>(() => {
    if (!allow) return null;
    return Array.isArray(allow) ? allow : [allow];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowKey]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (allowed && !allowed.includes(user.role)) {
      // Logged in but wrong role — bounce to their own home.
      router.replace('/');
    }
  }, [loading, user, allowed, router]);

  if (loading) return <FullScreenLoader label="Loading…" />;
  if (!user) return null;
  if (allowed && !allowed.includes(user.role)) return null;
  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline loader — kept private to this file so it doesn't depend on the
// components/ folder (which is a later step).
// ─────────────────────────────────────────────────────────────────────────────

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}