'use client';

// app/lecturer/page.tsx
//
// Lecturer home. Combines:
//   - GET /api/timetables/mine  -> slots, with `open_now` hint
//   - GET /api/sessions/mine    -> recent sessions + live status
// and exposes POST /api/sessions/launch with the lecturer's current GPS.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { api, isApiError } from '@/lib/api';
import { RequireAuth, useAuth } from '@/lib/auth';
import {
  getCurrentFix,
  isGeolocationFailure,
  type GeolocationFailure,
} from '@/lib/geolocation';
import { AlertFromError } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/Card';
import { EndedBadge, LiveBadge, OpenNowBadge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { FullPageSpinner, Spinner } from '@/components/Spinner';
import type { ApiError, DayOfWeek, LecturerSession, Timetable } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DAY_ORDER: Record<DayOfWeek, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

/** Postgres TIME returns "HH:MM:SS"; display wants "HH:MM". */
function trimSeconds(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LecturerHomePage() {
  return (
    <RequireAuth allow="lecturer">
      <LecturerHome />
    </RequireAuth>
  );
}

function LecturerHome() {
  const router = useRouter();
  const { user, logout } = useAuth();

  // ── Data ────────────────────────────────────────────────────────────────
  const [timetables, setTimetables] = useState<Timetable[] | null>(null);
  const [sessions, setSessions] = useState<LecturerSession[] | null>(null);
  const [loadErr, setLoadErr] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Launch flow ─────────────────────────────────────────────────────────
  const [launchingId, setLaunchingId] = useState<number | null>(null);
  const [launchPhase, setLaunchPhase] = useState<'idle' | 'locating' | 'launching'>('idle');
  const [launchErr, setLaunchErr] = useState<ApiError | null>(null);

  // ── Load both resources in parallel ──────────────────────────────────────
  const load = useCallback(async () => {
    setRefreshing(true);
    setLoadErr(null);
    try {
      const [tt, ss] = await Promise.all([
        api.timetables.mine(),
        api.sessions.mine(),
      ]);
      setTimetables(
        [...tt.timetables].sort(
          (a, b) =>
            DAY_ORDER[a.day_of_week] - DAY_ORDER[b.day_of_week] ||
            a.start_time.localeCompare(b.start_time),
        ),
      );
      setSessions(ss.sessions);
    } catch (e) {
      if (isApiError(e)) setLoadErr(e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Live session lookup by timetable_id ─────────────────────────────────
  const liveByTimetableId = useMemo(() => {
    const m = new Map<number, LecturerSession>();
    if (sessions) {
      for (const s of sessions) {
        if (s.live) m.set(s.timetable_id, s);
      }
    }
    return m;
  }, [sessions]);

  // ── Launch handler ──────────────────────────────────────────────────────
  const launch = useCallback(
    async (timetableId: number) => {
      if (launchingId !== null) return;
      setLaunchErr(null);
      setLaunchingId(timetableId);
      setLaunchPhase('locating');

      try {
        const fix = await getCurrentFix();
        setLaunchPhase('launching');

        const res = await api.sessions.launch({
          timetable_id: timetableId,
          latitude: fix.latitude,
          longitude: fix.longitude,
        });

        router.push(`/lecturer/session/${res.session_id}`);
      } catch (e) {
        if (isGeolocationFailure(e)) {
          setLaunchErr({ status: 0, error: (e as GeolocationFailure).message });
        } else if (isApiError(e)) {
          setLaunchErr(e);
        } else {
          setLaunchErr({ status: 0, error: 'Unexpected error. Please try again.' });
        }
        setLaunchingId(null);
        setLaunchPhase('idle');
      }
    },
    [launchingId, router],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  const isLoading = timetables === null || sessions === null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              Lecturer dashboard
            </p>
            <p className="truncate text-xs text-slate-500">
              {user?.full_name} · {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {refreshing && <Spinner size="sm" inline label="Refreshing" />}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              disabled={refreshing}
            >
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={() => logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {launchErr && (
          <AlertFromError error={launchErr} className="mb-4" />
        )}
        {loadErr && <AlertFromError error={loadErr} className="mb-4" />}

        {isLoading && !loadErr ? (
          <FullPageSpinner label="Loading your schedule…" />
        ) : (
          <>
            {/* ─── Timetable slots ───────────────────────────────────────── */}
            <section className="mb-8">
              <div className="mb-3">
                <h1 className="text-lg font-semibold text-slate-900">
                  Your timetable slots
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  Launch a session from inside the room. Your current location
                  anchors the geofence.
                </p>
              </div>

              {timetables && timetables.length === 0 ? (
                <EmptyState
                  icon="schedule"
                  title="No timetable slots assigned"
                  description="Ask an administrator to add slots for your courses."
                />
              ) : (
                <ul className="space-y-3">
                  {timetables?.map((t) => {
                    const live = liveByTimetableId.get(t.timetable_id);
                    return (
                      <SlotCard
                        key={t.timetable_id}
                        slot={t}
                        liveSession={live}
                        launchingId={launchingId}
                        launchPhase={launchPhase}
                        onLaunch={() => void launch(t.timetable_id)}
                      />
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ─── Recent sessions ──────────────────────────────────────── */}
            <section>
              <div className="mb-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Recent sessions
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Your last {sessions?.length ?? 0} sessions.
                </p>
              </div>

              {sessions && sessions.length === 0 ? (
                <EmptyState
                  icon="history"
                  title="No sessions yet"
                  description="Once you launch a session, it will appear here."
                />
              ) : (
                <ul className="space-y-2">
                  {sessions?.map((s) => (
                    <SessionRow key={s.session_id} session={s} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot card
// ─────────────────────────────────────────────────────────────────────────────

function SlotCard({
  slot,
  liveSession,
  launchingId,
  launchPhase,
  onLaunch,
}: {
  slot: Timetable;
  liveSession: LecturerSession | undefined;
  launchingId: number | null;
  launchPhase: 'idle' | 'locating' | 'launching';
  onLaunch: () => void;
}) {
  const busy = launchingId === slot.timetable_id;
  const busyLabel =
    busy && launchPhase === 'locating'
      ? 'Getting your location…'
      : busy && launchPhase === 'launching'
        ? 'Launching…'
        : 'Launch session';

  return (
    <Card as="li">
      <CardHeader
        title={`${slot.course_code} · ${slot.course_name}`}
        subtitle={`${slot.day_of_week} · ${trimSeconds(slot.start_time)}–${trimSeconds(slot.end_time)} · ${slot.room_name}`}
        right={liveSession ? <LiveBadge /> : <OpenNowBadge open={slot.open_now} />}
      />
      <CardBody className="!py-3">
        <p className="text-xs text-slate-500">
          Geofence radius:{' '}
          <span className="font-medium text-slate-700">
            {slot.allowed_radius_meters}m
          </span>
        </p>
      </CardBody>
      <CardFooter>
        {liveSession ? (
          <Link href={`/lecturer/session/${liveSession.session_id}`}>
            <Button variant="secondary">Currently live →</Button>
          </Link>
        ) : (
          <Button
            onClick={onLaunch}
            disabled={launchingId !== null}
            loading={busy}
          >
            {busy ? busyLabel : 'Launch session'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent session row
// ─────────────────────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: LecturerSession }) {
  return (
    <Card as="li">
      <Link
        href={`/lecturer/session/${session.session_id}`}
        className="block px-4 py-3 transition-colors hover:bg-slate-50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {session.course_code}
            </p>
            <p className="truncate text-xs text-slate-500">
              {session.room_name} · launched{' '}
              {new Date(session.launched_at).toLocaleString()}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-slate-500">
              {session.present} present
            </span>
            {session.live ? <LiveBadge /> : <EndedBadge />}
          </div>
        </div>
      </Link>
    </Card>
  );
}