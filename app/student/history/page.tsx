'use client';

// app/student/history/page.tsx
//
// Attendance history for the logged-in student. Reads GET /api/attendance/me.
// Desktop = table, mobile = stacked cards. No polling — history only changes
// on check-in, and users arrive here fresh from the check-in flow.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { api, isApiError } from '@/lib/api';
import { RequireAuth, useAuth } from '@/lib/auth';
import { AlertFromError } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { StatusBadge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Spinner, FullPageSpinner } from '@/components/Spinner';
import type { ApiError, MyAttendanceRecord } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────

export default function StudentHistoryPage() {
  return (
    <RequireAuth allow="student">
      <History />
    </RequireAuth>
  );
}

function History() {
  const { user, logout } = useAuth();
  const [records, setRecords] = useState<MyAttendanceRecord[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.attendance.me();
      setRecords(res.records);
      setError(null);
    } catch (e) {
      if (isApiError(e)) setError(e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Aggregate counters — cheap, no extra request.
  const stats = useMemo(() => {
    if (!records) return null;
    let present = 0;
    let late = 0;
    for (const r of records) {
      if (r.status === 'Present') present += 1;
      else if (r.status === 'Late') late += 1;
    }
    return { total: records.length, present, late };
  }, [records]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              My attendance
            </p>
            <p className="truncate text-xs text-slate-500">
              {user?.full_name} · {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/student"
              className="hidden text-xs font-medium text-slate-600 hover:text-slate-900 sm:inline"
            >
              ← Sessions
            </Link>
            <Button variant="secondary" size="sm" onClick={() => logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">History</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {stats
                ? `${stats.total} record${stats.total === 1 ? '' : 's'} · ${stats.present} present · ${stats.late} late`
                : 'Loading…'}
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
          </div>
        </div>

        {error && <AlertFromError error={error} className="mb-4" />}

        {records === null && !error ? (
          <FullPageSpinner label="Loading your history…" />
        ) : records && records.length === 0 ? (
          <EmptyState
            icon="history"
            title="No attendance records yet"
            description="Once you check in to a live session, your record will appear here."
            action={
              <Link
                href="/student"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                View live sessions →
              </Link>
            }
          />
        ) : records ? (
          <>
            {/* Mobile: stacked cards */}
            <ul className="space-y-2 sm:hidden">
              {records.map((r) => (
                <Card as="li" key={r.record_id}>
                  <CardBody className="!py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {r.course_code}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {r.course_name}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div>
                        <dt className="text-slate-500">Time</dt>
                        <dd>{new Date(r.check_in_time).toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Distance</dt>
                        <dd>
                          {r.distance_meters === null
                            ? '—'
                            : `${r.distance_meters.toFixed(1)}m`}
                        </dd>
                      </div>
                    </dl>
                  </CardBody>
                </Card>
              ))}
            </ul>

            {/* Desktop: table */}
            <Card className="hidden sm:block">
              <CardHeader
                title="All records"
                subtitle="Most recent first"
              />
              <CardBody padded={false}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Course</th>
                        <th className="px-4 py-2.5 font-medium">Date</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          Distance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {records.map((r) => (
                        <tr key={r.record_id}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">
                              {r.course_code}
                            </p>
                            <p className="text-xs text-slate-500">
                              {r.course_name}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {new Date(r.check_in_time).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">
                            {r.distance_meters === null
                              ? '—'
                              : `${r.distance_meters.toFixed(1)}m`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </>
        ) : null}
      </main>
    </div>
  );
}