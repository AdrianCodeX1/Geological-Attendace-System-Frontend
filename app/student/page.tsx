'use client';

// app/student/page.tsx
//
// Student home. Lists currently-live sessions from GET /api/sessions/active,
// polled every 5s while the page is mounted. Students tap into a session to
// check in on /student/check-in/[id].

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { api, isApiError } from '@/lib/api';
import { RequireAuth, useAuth } from '@/lib/auth';
import { Alert, AlertFromError } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LiveBadge } from '@/components/Badge';
import { Spinner, FullPageSpinner } from '@/components/Spinner';
import type { ActiveSession, ApiError } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function StudentHomePage() {
  return (
    <RequireAuth allow="student">
      <StudentHome />
    </RequireAuth>
  );
}

function StudentHome() {
  const { user, logout } = useAuth();

  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Track the current in-flight controller so the poll tick and the manual
  // refresh can both cancel a stale request on unmount.
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async (background: boolean) => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;

    if (!background) setRefreshing(true);

    try {
      const res = await api.sessions.active({ signal: controller.signal });
      setSessions(res.sessions);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (isApiError(err)) setError(err);
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    void load(false);
    const id = window.setInterval(() => void load(true), 5000);
    return () => {
      window.clearInterval(id);
      inflight.current?.abort();
    };
  }, [load]);

  // Refresh when the tab regains focus
  useEffect(() => {
    function onFocus() {
      void load(true);
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              Attendance System
            </p>
            <p className="truncate text-xs text-slate-500">
              {user?.full_name} · {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/student/history"
              className="hidden text-xs font-medium text-slate-600 hover:text-slate-900 sm:inline"
            >
              My history
            </Link>
            <Button variant="secondary" size="sm" onClick={() => logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Live sessions
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {refreshing && <Spinner size="sm" inline label="Refreshing" />}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load(false)}
              disabled={refreshing}
            >
              Refresh
            </Button>
          </div>
        </div>

        {error && <AlertFromError error={error} className="mb-4" />}

        {sessions === null && !error ? (
          <FullPageSpinner label="Loading your sessions…" />
        ) : sessions && sessions.length === 0 ? (
          <EmptyState
            icon="sessions"
            title="No live sessions right now"
            description="When your lecturer starts a session for one of your courses, it will appear here."
            action={
              <Link
                href="/student/history"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                View attendance history →
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {sessions?.map((s) => (
              <SessionCard key={s.session_id} session={s} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session card
// ─────────────────────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: ActiveSession }) {
  const [now, setNow] = useState(() => Date.now());

  // 1s tick to update the countdown text.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const expires = new Date(session.expires_at).getTime();
  const msLeft = Math.max(0, expires - now);
  const minutesLeft = Math.floor(msLeft / 60_000);
  const secondsLeft = Math.floor((msLeft % 60_000) / 1000);
  const countdown =
    msLeft === 0
      ? 'Ended'
      : minutesLeft > 0
        ? `${minutesLeft}m ${String(secondsLeft).padStart(2, '0')}s left`
        : `${secondsLeft}s left`;

  return (
    <Card as="li">
      <CardHeader
        title={`${session.course_code} · ${session.course_name}`}
        subtitle={session.room_name}
        right={<LiveBadge />}
      />
      <CardBody className="!py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Launched{' '}
            <span className="text-slate-700">
              {new Date(session.launched_at).toLocaleTimeString()}
            </span>
          </span>
          <span className={msLeft < 60_000 ? 'text-amber-600' : ''}>
            {countdown}
          </span>
        </div>
      </CardBody>
      <CardFooter>
        {session.already_checked_in ? (
          <Alert
            tone="success"
            title="You're checked in for this session."
            className="!py-2"
          />
        ) : (
          <Link href={`/student/check-in/${session.session_id}`}>
            <Button>Check in</Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}