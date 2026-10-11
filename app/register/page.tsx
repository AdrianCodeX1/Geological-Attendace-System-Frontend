'use client';

// app/register/page.tsx
//
// Student self-registration. Backend forces role='student' here (see
// routes/auth.js), so there is no role toggle.
//
// Validation mirrors the backend's Zod schema exactly:
//   - email: institutional domain (config.allowedEmailDomains)
//   - password: 8..100 chars
//   - full_name: 2..150 chars
//
// NOTE: The institutional domain is hardcoded here. If the backend's
// ALLOWED_EMAIL_DOMAINS env var changes, update INSTITUTIONAL_DOMAIN below.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth';
import { isApiError } from '@/lib/api';
import { Alert, AlertFromError } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Card, CardBody } from '@/components/Card';
import { Input } from '@/components/Input';
import { FullPageSpinner } from '@/components/Spinner';
import type { ApiError } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const INSTITUTIONAL_DOMAIN = 'mulungushi.edu.zm';

const EMAIL_RE = new RegExp(`^[^\\s@]+@${INSTITUTIONAL_DOMAIN.replace('.', '\\.')}$`, 'i');
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 100;
const NAME_MIN = 2;
const NAME_MAX = 150;

// ─────────────────────────────────────────────────────────────────────────────
// Client-side field validation — returns per-field error strings or nulls.
// ─────────────────────────────────────────────────────────────────────────────

type FieldErrors = {
  full_name?: string;
  email?: string;
  password?: string;
};

function validate(full_name: string, email: string, password: string): FieldErrors {
  const errs: FieldErrors = {};

  if (full_name.trim().length < NAME_MIN || full_name.trim().length > NAME_MAX) {
    errs.full_name = `Name must be ${NAME_MIN}–${NAME_MAX} characters.`;
  }

  if (!EMAIL_RE.test(email.trim())) {
    errs.email = `Email must be a @${INSTITUTIONAL_DOMAIN} address.`;
  }

  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    errs.password = `Password must be at least ${PASSWORD_MIN} characters.`;
  }

  return errs;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading, register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  // If already authenticated, bounce to /student.
  useEffect(() => {
    if (loading) return;
    if (user) router.replace('/student');
  }, [loading, user, router]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setError(null);

    const errs = validate(fullName, email, password);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      await register({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
      });
      router.replace('/student');
    } catch (err) {
      if (isApiError(err)) setError(err);
      else setError({ status: 0, error: 'Unexpected error. Please try again.' });
      setSubmitting(false);
    }
  }

  if (loading) return <FullPageSpinner label="Checking your session…" />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Students only — lecturers are created by an administrator.
          </p>
        </div>

        <Card>
          <CardBody>
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <Input
                ref={nameRef}
                label="Full name"
                type="text"
                name="full_name"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (fieldErrors.full_name) {
                    setFieldErrors((f) => ({ ...f, full_name: undefined }));
                  }
                }}
                error={fieldErrors.full_name}
                placeholder="Jane Doe"
                disabled={submitting}
              />

              <Input
                label="Institutional email"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((f) => ({ ...f, email: undefined }));
                  }
                }}
                error={fieldErrors.email}
                hint={`Must be a @${INSTITUTIONAL_DOMAIN} address.`}
                placeholder={`you@${INSTITUTIONAL_DOMAIN}`}
                disabled={submitting}
              />

              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((f) => ({ ...f, password: undefined }));
                  }
                }}
                error={fieldErrors.password}
                hint={`At least ${PASSWORD_MIN} characters.`}
                disabled={submitting}
              />

              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  disabled={submitting}
                />
                Show password
              </label>

              {error && <AlertFromError error={error} />}

              {error?.status === 409 && (
                <Alert tone="info" title="Already have an account?">
                  <Link
                    href="/login"
                    className="font-medium text-brand-700 underline"
                  >
                    Sign in instead
                  </Link>
                </Alert>
              )}

              <Button
                type="submit"
                fullWidth
                loading={submitting}
                disabled={!fullName || !email || !password}
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-brand-600 hover:text-brand-700"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}