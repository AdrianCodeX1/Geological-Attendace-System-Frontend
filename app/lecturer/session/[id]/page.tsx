'use client';

// app/lecturer/session/[id]/page.tsx
//
// The live session screen. Two independent polling loops:
//   - GET /api/sessions/:id/code        every 1.2s (TOTP_STEP=5 → code rotates
//                                        every 5s, so we refresh faster than that)
//   - GET /api/sessions/:id/attendance  every 4s
//
// Handles the 410 "Session has ended." case by stopping both loops and
// rendering an ended state — never as a red error, since it's a normal event.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

import { api, isApiError } from '@/lib/api';
import { RequireAuth, useAuth } from '@/lib/auth';
import { Alert, AlertFromError } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/Card';
import { StatusBadge, LiveBadge, EndedBadge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Spinner, FullPageSpinner } from '@/components/Spinner';
import type {
  ApiError,
  SessionAttendanceResponse,
  SessionCodeResponse,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CODE_POLL_MS = 1200;       // < TOTP_STEP * 1000 / 2  (step=5s → 2.5s half-life)
const ATTENDANCE_POLL_MS = 4000;
const COUNTDOWN_TICK_MS = 100;

// ─────────────────────────────────────────────────────────────────────────────

export default function LecturerSessionPage() {
  return (
    <RequireAuth allow={['lecturer', 'admin']}>
      <LecturerSession />
    </RequireAuth>
  );
}

function LecturerSession() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = Number(params.id);

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return (
      <Shell>
        <EmptyState
          icon="search"
          title="Invalid session link"
          description="The session id in the URL is not valid."
          action={
            <Link href="/lecturer" className="text-xs text-brand-600">
              ← Back to dashboard
            </Link>
          }
        />
      </Shell>
    );
  }

  return (
    <Shell sessionId={sessionId}>
      <SessionView sessionId={sessionId} onBack={() => router.push('/lecturer')} />
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────────

function Shell({
  children,
  sessionId,
}: {
  children: React.ReactNode;
  sessionId?: number;
}) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              Live session {sessionId !== undefined ? `#${sessionId}` : ''}
            </p>
            <p className="truncate text-xs text-slate-500">
              {user?.full_name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/lecturer"
              className="hidden text-xs font-medium text-slate-600 hover:text-slate-900 sm:inline"
            >
              ← Dashboard
            </Link>
            <Button variant="secondary" size="sm" onClick={() => logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session view
// ─────────────────────────────────────────────────────────────────────────────

function SessionView({
  sessionId,
  onBack,
}: {
  sessionId: number;
  onBack: () => void;
}) {
  // ── Code state ──────────────────────────────────────────────────────────
  const [codeData, setCodeData] = useState<SessionCodeResponse | null>(null);
  const [codeErr, setCodeErr] = useState<ApiError | null>(null);
  const [ended, setEnded] = useState(false);

  // ── Attendance state ────────────────────────────────────────────────────
  const [attendance, setAttendance] = useState<SessionAttendanceResponse | null>(
    null,
  );
  const [attendanceErr, setAttendanceErr] = useState<ApiError | null>(null);

  // ── End session ─────────────────────────────────────────────────────────
  const [ending, setEnding] = useState(false);
  const [endErr, setEndErr] = useState<ApiError | null>(null);

  // Guards against double-polling after `ended` flips true.
  const endedRef = useRef(false);

  // ── Countdown: derived from server's seconds_remaining + local elapsed ──
  // We remember the server value and the timestamp we received it, then tick
  // locally. Prevents a jittery countdown from slow round trips.
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const secondsRef = useRef({ value: 0, at: 0 });

  useEffect(() => {
    if (!codeData) return;
    secondsRef.current = {
      value: codeData.seconds_remaining,
      at: performance.now(),
    };
    setSecondsLeft(codeData.seconds_remaining);

    const id = window.setInterval(() => {
      const elapsed = (performance.now() - secondsRef.current.at) / 1000;
      const remaining = Math.max(0, secondsRef.current.value - elapsed);
      setSecondsLeft(remaining);
    }, COUNTDOWN_TICK_MS);

    return () => window.clearInterval(id);
  }, [codeData]);

  // ── Poll code ───────────────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();

    const tick = async () => {
      if (endedRef.current) return;
      try {
        const res = await api.sessions.code(sessionId, {
          signal: controller.signal,
        });
        setCodeData(res);
        setCodeErr(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (isApiError(e)) {
          if (e.status === 410) {
            endedRef.current = true;
            setEnded(true);
            return;
          }
          if (e.status === 403 || e.status === 404) {
            endedRef.current = true;
          }
          setCodeErr(e);
        }
      }
    };

    void tick();
    const id = window.setInterval(tick, CODE_POLL_MS);

    return () => {
      window.clearInterval(id);
      controller.abort();
    };
  }, [sessionId]);

  // ── Poll attendance ─────────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();

    const tick = async () => {
      if (endedRef.current) return;
      try {
        const res = await api.sessions.attendance(sessionId, {
          signal: controller.signal,
        });
        setAttendance(res);
        setAttendanceErr(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (isApiError(e)) {
          if (e.status === 410) {
            endedRef.current = true;
            setEnded(true);
            return;
          }
          setAttendanceErr(e);
        }
      }
    };

    void tick();
    const id = window.setInterval(tick, ATTENDANCE_POLL_MS);

    return () => {
      window.clearInterval(id);
      controller.abort();
    };
  }, [sessionId]);

  // ── End session ─────────────────────────────────────────────────────────
  const endSession = useCallback(async () => {
    if (ending || ended) return;
    if (!window.confirm('End this session now? Students will no longer be able to check in.')) {
      return;
    }
    setEnding(true);
    setEndErr(null);
    try {
      await api.sessions.end(sessionId);
      endedRef.current = true;
      setEnded(true);
    } catch (e) {
      if (isApiError(e)) setEndErr(e);
    } finally {
      setEnding(false);
    }
  }, [ending, ended, sessionId]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const totalSteps = codeData?.step_seconds ?? 5;
  const countdownPct = useMemo(() => {
    if (!codeData) return 0;
    return Math.max(0, Math.min(1, secondsLeft / totalSteps));
  }, [codeData, secondsLeft, totalSteps]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (ended) {
    return (
      <>
        <Alert tone="info" title="Session has ended." />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button onClick={onBack} fullWidth>
            ← Back to dashboard
          </Button>
          <Link href={`/lecturer/session/${sessionId}`} className="sm:w-auto">
            <Button variant="secondary" fullWidth onClick={() => window.location.reload()}>
              Reload status
            </Button>
          </Link>
        </div>
      </>
    );
  }

  if (!codeData && codeErr) {
    return (
      <>
        <AlertFromError error={codeErr} className="mb-4" />
        <Button variant="secondary" onClick={onBack} fullWidth>
          ← Back to dashboard
        </Button>
      </>
    );
  }

  if (!codeData) {
    return <FullPageSpinner label="Loading session…" />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
      {/* ─── Left: Code + QR ─────────────────────────────────────────────── */}
      <div>
        <Card>
          <CardHeader
            title="Live code"
            subtitle="Students scan the QR or enter the digits"
            right={<LiveBadge />}
          />
          <CardBody>
            {/* Countdown bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-brand-500 transition-[width] duration-100 ease-linear"
                style={{ width: `${countdownPct * 100}%` }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-1 text-right text-[11px] text-slate-500">
              New code in {Math.ceil(secondsLeft)}s
            </p>

            {/* The 6 digits */}
            <div className="mt-4 rounded-md bg-slate-50 py-4 text-center">
              <p className="font-mono text-4xl font-semibold tabular-nums tracking-[0.35em] text-slate-900 sm:text-5xl">
                {codeData.code}
              </p>
            </div>

            {/* QR */}
            <div className="mt-5 flex flex-col items-center">
              <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <QRCodeSVG
                  value={codeData.qr_payload}
                  size={224}
                  level="M"
                  
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Rotates every {codeData.step_seconds}s
              </p>
            </div>
          </CardBody>
        </Card>

        <Card className="mt-4">
          <CardBody>
            <Button
              variant="danger"
              fullWidth
              loading={ending}
              onClick={() => void endSession()}
              disabled={ending}
            >
              {ending ? 'Ending session…' : 'End session'}
            </Button>
            {endErr && <AlertFromError error={endErr} className="mt-3" />}
          </CardBody>
        </Card>
      </div>

      {/* ─── Right: Live attendance ──────────────────────────────────────── */}
      <div>
        <Card>
          <CardHeader
            title="Live attendance"
            subtitle={
              attendance
                ? `${attendance.present} checked in · ${attendance.enrolled} enrolled`
                : 'Loading…'
            }
            right={
              attendance && attendance.enrolled > 0 ? (
                <span className="text-xs font-medium text-slate-500">
                  {Math.round(
                    (attendance.present / attendance.enrolled) * 100,
                  )}
                  %
                </span>
              ) : undefined
            }
          />
          <CardBody padded={false}>
            {attendanceErr && (
              <div className="p-4">
                <AlertFromError error={attendanceErr} />
              </div>
            )}

            {!attendance && !attendanceErr && (
              <div className="flex items-center justify-center py-10">
                <Spinner size="md" label="Loading attendance…" />
              </div>
            )}

            {attendance && attendance.records.length === 0 && (
              <EmptyState
                icon="people"
                title="No one has checked in yet"
                description="Show the QR above — records will appear here as students scan in."
              />
            )}

            {attendance && attendance.records.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {attendance.records.map((r) => (
                  <li
                    key={r.student_id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {r.full_name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {r.email}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      <div>
                        <p className="text-xs text-slate-500">
                          {new Date(r.check_in_time).toLocaleTimeString()}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400">
                          {r.distance_meters === null
                            ? '—'
                            : `${r.distance_meters.toFixed(1)}m`}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
          {attendance && attendance.records.length > 0 && (
            <CardFooter>
              <Link href={`/lecturer/session/${sessionId}`}>
                <Button variant="secondary" size="sm">
                  Reload
                </Button>
              </Link>
            </CardFooter>
          )}
        </Card>

        {!attendance?.live && attendance && (
          <div className="mt-4">
            <Alert tone="info" title="Session is no longer live." />
          </div>
        )}
      </div>
    </div>
  );
}