'use client';

// app/admin/page.tsx
//
// Admin console. Five tabs: users, courses, timetables, enrollments, report.
//
// NOTE: routes/admin.js does NOT expose lookup endpoints (GET /users,
// GET /courses, GET /timetables). So the Timetable and Enrollments tabs
// require the admin to type numeric IDs. The Users tab echoes the returned
// user_id after creating a lecturer, so the admin can note it for later.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { api, isApiError } from '@/lib/api';
import { RequireAuth, useAuth } from '@/lib/auth';
import { Alert, AlertFromError } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Input } from '@/components/Input';
import { RoleBadge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Spinner } from '@/components/Spinner';
import type {
  AdminReportRow,
  AdminUser,
  ApiError,
  Course,
  DayOfWeek,
  Role,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'users' | 'courses' | 'timetables' | 'enrollments' | 'report';

const TABS: { id: TabId; label: string }[] = [
  { id: 'users', label: 'Users' },
  { id: 'courses', label: 'Courses' },
  { id: 'timetables', label: 'Timetables' },
  { id: 'enrollments', label: 'Enrollments' },
  { id: 'report', label: 'Report' },
];

const DAYS: DayOfWeek[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  return (
    <RequireAuth allow="admin">
      <Admin />
    </RequireAuth>
  );
}

function Admin() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<TabId>('users');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              Admin console
            </p>
            <p className="truncate text-xs text-slate-500">
              {user?.full_name} · {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RoleBadge role="admin" />
            <Button variant="secondary" size="sm" onClick={() => logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {/* Tab strip */}
        <div
          role="tablist"
          className="mb-5 flex flex-wrap gap-1 border-b border-slate-200"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={[
                  '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900',
                ].join(' ')}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'users' && <UsersTab />}
        {tab === 'courses' && <CoursesTab />}
        {tab === 'timetables' && <TimetablesTab />}
        {tab === 'enrollments' && <EnrollmentsTab />}
        {tab === 'report' && <ReportTab />}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Users
// ─────────────────────────────────────────────────────────────────────────────

function UsersTab() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('lecturer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [created, setCreated] = useState<AdminUser | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setCreated(null);
    setSubmitting(true);
    try {
      const res = await api.admin.createUser({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role,
      });
      setCreated(res.user);
      setEmail('');
      setPassword('');
      setFullName('');
    } catch (e) {
      if (isApiError(e)) setError(e);
      else setError({ status: 0, error: 'Unexpected error.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Create user"
        subtitle="Lecturers and admins are created here. Students self-register."
      />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Input
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            disabled={submitting}
            placeholder="Jane Doe"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={submitting}
            placeholder="name@mulungushi.edu.zm"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={submitting}
            hint="8–100 characters."
          />
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Role
            </span>
            <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1">
              {(['student', 'lecturer', 'admin'] as Role[]).map((r) => {
                const active = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={[
                      'rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                      active
                        ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-600 hover:text-slate-800',
                    ].join(' ')}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <AlertFromError error={error} />}

          {created && (
            <Alert tone="success" title="User created">
              <p className="text-xs">
                <span className="font-medium">{created.full_name}</span> —{' '}
                <span className="font-mono">user_id = {created.user_id}</span>{' '}
                <RoleBadge role={created.role} />
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Note this ID — you'll need it for the Timetables tab.
              </p>
            </Alert>
          )}

          <Button
            type="submit"
            loading={submitting}
            disabled={!email || !password || !fullName}
          >
            Create user
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Courses
// ─────────────────────────────────────────────────────────────────────────────

function CoursesTab() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [created, setCreated] = useState<Course | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setCreated(null);
    setSubmitting(true);
    try {
      const res = await api.admin.createCourse({
        course_code: code.trim(),
        course_name: name.trim(),
      });
      setCreated(res.course);
      setCode('');
      setName('');
    } catch (e) {
      if (isApiError(e)) setError(e);
      else setError({ status: 0, error: 'Unexpected error.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Create course"
        subtitle="Course codes are uppercased server-side."
      />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Input
            label="Course code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            disabled={submitting}
            placeholder="ICT481"
          />
          <Input
            label="Course name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={submitting}
            placeholder="ICT Project Management"
          />

          {error && <AlertFromError error={error} />}

          {created && (
            <Alert tone="success" title="Course created">
              <p className="text-xs">
                <span className="font-medium">{created.course_code}</span> —{' '}
                <span className="font-mono">course_id = {created.course_id}</span>
              </p>
            </Alert>
          )}

          <Button
            type="submit"
            loading={submitting}
            disabled={!code || !name}
          >
            Create course
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Timetables
// ─────────────────────────────────────────────────────────────────────────────

function TimetablesTab() {
  const [courseId, setCourseId] = useState('');
  const [lecturerId, setLecturerId] = useState('');
  const [day, setDay] = useState<DayOfWeek>('Monday');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [roomName, setRoomName] = useState('');
  const [lat, setLat] = useState('-14.438');
  const [lon, setLon] = useState('28.446');
  const [radius, setRadius] = useState('20');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setOk(false);
    setSubmitting(true);
    try {
      await api.admin.createTimetable({
        course_id: Number(courseId),
        lecturer_id: Number(lecturerId),
        day_of_week: day,
        start_time: startTime,
        end_time: endTime,
        room_name: roomName.trim(),
        room_latitude: Number(lat),
        room_longitude: Number(lon),
        allowed_radius_meters: Number(radius),
      });
      setOk(true);
    } catch (e) {
      if (isApiError(e)) setError(e);
      else setError({ status: 0, error: 'Unexpected error.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Create timetable slot"
        subtitle="Enter numeric IDs — no lookup endpoint exists yet."
      />
      <CardBody>
        <Alert tone="info" title="Where do the IDs come from?">
          <p className="text-xs">
            <strong>Course ID</strong> — shown after you create a course in the
            Courses tab. <strong>Lecturer ID</strong> — shown after you create a
            lecturer in the Users tab.
          </p>
        </Alert>

        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Course ID"
              type="number"
              inputMode="numeric"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
              disabled={submitting}
            />
            <Input
              label="Lecturer ID"
              type="number"
              inputMode="numeric"
              value={lecturerId}
              onChange={(e) => setLecturerId(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Day
              </label>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value as DayOfWeek)}
                disabled={submitting}
                className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Start time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              disabled={submitting}
            />
            <Input
              label="End time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <Input
            label="Room name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            required
            disabled={submitting}
            placeholder="Demo Room"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Room latitude"
              type="number"
              step="0.00000001"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              required
              disabled={submitting}
            />
            <Input
              label="Room longitude"
              type="number"
              step="0.00000001"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <Input
            label="Geofence radius"
            type="number"
            inputMode="numeric"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            disabled={submitting}
            hint="Meters. Default 20, range 5–200."
          />

          {error && <AlertFromError error={error} />}
          {ok && <Alert tone="success" title="Timetable slot created." />}

          <Button type="submit" loading={submitting}>
            Create slot
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Enrollments
// ─────────────────────────────────────────────────────────────────────────────

function EnrollmentsTab() {
  const [courseId, setCourseId] = useState('');
  const [emailsText, setEmailsText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [enrolled, setEnrolled] = useState<number | null>(null);

  const parsedEmails = emailsText
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const uniqueEmails = Array.from(new Set(parsedEmails));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setEnrolled(null);

    if (uniqueEmails.length === 0) {
      setError({ status: 400, error: 'Enter at least one student email.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.admin.enroll({
        course_id: Number(courseId),
        student_emails: uniqueEmails,
      });
      setEnrolled(res.enrolled);
    } catch (e) {
      if (isApiError(e)) setError(e);
      else setError({ status: 0, error: 'Unexpected error.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Enroll students"
        subtitle="Paste emails — duplicates and already-enrolled students are skipped."
      />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Input
            label="Course ID"
            type="number"
            inputMode="numeric"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            required
            disabled={submitting}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Student emails
            </label>
            <textarea
              value={emailsText}
              onChange={(e) => setEmailsText(e.target.value)}
              disabled={submitting}
              rows={8}
              placeholder={`student1@mulungushi.edu.zm\nstudent2@mulungushi.edu.zm`}
              className="block w-full rounded-md border-0 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
            />
            <p className="mt-1 text-xs text-slate-500">
              One per line, or separated by commas. {uniqueEmails.length} unique
              email{uniqueEmails.length === 1 ? '' : 's'} parsed.
            </p>
          </div>

          {error && <AlertFromError error={error} />}

          {enrolled !== null && (
            <Alert tone="success" title={`Enrolled ${enrolled} student(s).`}>
              <p className="text-xs">
                Already-enrolled students were skipped. If the number is lower
                than expected, some were already on the course.
              </p>
            </Alert>
          )}

          <Button
            type="submit"
            loading={submitting}
            disabled={!courseId || uniqueEmails.length === 0}
          >
            Enroll {uniqueEmails.length > 0 ? `${uniqueEmails.length} student(s)` : ''}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Report
// ─────────────────────────────────────────────────────────────────────────────

function ReportTab() {
  const [courseId, setCourseId] = useState('');
  const [rows, setRows] = useState<AdminReportRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchReport = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    setRows(null);
    try {
      const res = await api.admin.report(Number(courseId));
      setRows(res.report);
    } catch (e) {
      if (isApiError(e)) setError(e);
      else setError({ status: 0, error: 'Unexpected error.' });
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void fetchReport();
  }

  return (
    <Card>
      <CardHeader
        title="Course attendance report"
        subtitle="Per-student present / late counts."
      />
      <CardBody padded={false}>
        <form
          onSubmit={onSubmit}
          className="flex items-end gap-3 border-b border-slate-200 p-4 sm:p-5"
        >
          <div className="flex-1">
            <Input
              label="Course ID"
              type="number"
              inputMode="numeric"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <Button type="submit" loading={loading} disabled={!courseId}>
            Load report
          </Button>
        </form>

        {error && (
          <div className="p-4 sm:p-5">
            <AlertFromError error={error} />
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Spinner size="md" label="Loading report…" />
          </div>
        )}

        {!loading && rows && rows.length === 0 && (
          <EmptyState
            icon="people"
            title="No students enrolled in this course."
          />
        )}

        {!loading && rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Student</th>
                  <th className="px-4 py-2.5 text-right font-medium">Present</th>
                  <th className="px-4 py-2.5 text-right font-medium">Late</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sessions</th>
                  <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const rate =
                    r.total_sessions > 0
                      ? Math.round(((r.present + r.late) / r.total_sessions) * 100)
                      : 0;
                  return (
                    <tr key={r.email}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {r.full_name}
                        </p>
                        <p className="text-xs text-slate-500">{r.email}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {r.present}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {r.late}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {r.total_sessions}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {rate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}