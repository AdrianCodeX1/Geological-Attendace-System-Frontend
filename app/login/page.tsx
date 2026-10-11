'use client';

// app/login/page.tsx
//
// Login form. Two role options: "Student" and "Lecturer / Admin" — matching
// the backend's role gate in routes/auth.js (which treats lecturer + admin
// the same on the "not student" branch).

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth';
import { isApiError } from '@/lib/api';
import { AlertFromError } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Card, CardBody } from '@/components/Card';
import { Input } from '@/components/Input';
import { FullPageSpinner } from '@/components/Spinner';
import type { ApiError, Role } from '@/lib/types';

type RoleOption = 'student' | 'lecturer';

const ROLE_HOME: Record<Role, string> = {
  student: '/student',
  lecturer: '/lecturer',
  admin: '/admin',
};

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();

  const [role, setRole] = useState<RoleOption>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);

  // If already authenticated, bounce to the correct home.
  useEffect(() => {
    if (loading) return;
    if (user) router.replace(ROLE_HOME[user.role]);
  }, [loading, user, router]);

  // Autofocus email on mount for quick keyboard flow.
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      const u = await login({ email, password, role });
      router.replace(ROLE_HOME[u.role]);
    } catch (err) {
      if (isApiError(err)) setError(err);
      else setError({ status: 0, error: 'Unexpected error. Please try again.' });
      setSubmitting(false);
    }
    // On success we do NOT reset `submitting` — the redirect unmounts the page.
  }

  // While the bootstrap is running, avoid flashing the form.
  if (loading) return <FullPageSpinner label="Checking your session…" />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            Attendance System
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Mulungushi University
          </p>
        </div>

        <Card>
          <CardBody>
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {/* Role toggle */}
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Sign in as
                </span>
                <div
                  role="radiogroup"
                  aria-label="Sign in as"
                  className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1"
                >
                  {(['student', 'lecturer'] as const).map((r) => {
                    const active = role === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setRole(r)}
                        className={[
                          'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200'
                            : 'text-slate-600 hover:text-slate-800',
                        ].join(' ')}
                      >
                        {r === 'student' ? 'Student' : 'Lecturer / Admin'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Input
                ref={emailRef}
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@mulungushi.edu.zm"
                disabled={submitting}
              />

              <Input
                label="Password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />

              {error && <AlertFromError error={error} />}

              <Button
                type="submit"
                fullWidth
                loading={submitting}
                disabled={!email || !password}
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-xs text-slate-500">
          New student?{' '}
          <Link
            href="/register"
            className="font-medium text-brand-600 hover:text-brand-700"
          >
            Create an account
          </Link>
        </p>

        <p className="mt-2 text-center text-[11px] text-slate-400">
          Demo: admin@ / lecturer@ / student1@ — all with{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">Password123!</code>
        </p>
      </div>
    </main>
  );
}