// components/Badge.tsx
//
// All status pills in the app. Semantic components (not a generic <Badge tone>)
// so the color mapping stays in one place and call sites stay readable.

import type { ReactNode } from 'react';
import type {
  AttemptOutcome,
  AttendanceStatus,
  Role,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Base pill
// ─────────────────────────────────────────────────────────────────────────────

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'purple';

const TONE_CLASSES: Record<Tone, string> = {
  green:  'bg-green-50  text-green-700  ring-green-200',
  amber:  'bg-amber-50  text-amber-700  ring-amber-200',
  red:    'bg-red-50    text-red-700    ring-red-200',
  blue:   'bg-brand-50  text-brand-700  ring-brand-200',
  slate:  'bg-slate-100 text-slate-700  ring-slate-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
};

type BaseBadgeProps = {
  tone: Tone;
  children: ReactNode;
  /** Adds a slow pulse — used by <LiveBadge />. */
  pulse?: boolean;
  className?: string;
};

function BaseBadge({ tone, children, pulse, className }: BaseBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASSES[tone],
        pulse ? 'animate-pulse-live' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance status — attendance_records.status
// ─────────────────────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: AttendanceStatus }) {
  const tone: Tone = status === 'Present' ? 'green' : 'amber';
  return <BaseBadge tone={tone}>{status}</BaseBadge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live / open indicator — driven by `live` or `open_now` boolean
// ─────────────────────────────────────────────────────────────────────────────

export function LiveBadge() {
  return (
    <BaseBadge tone="red" pulse>
      <span
        className="h-1.5 w-1.5 rounded-full bg-red-500"
        aria-hidden="true"
      />
      LIVE
    </BaseBadge>
  );
}

export function EndedBadge() {
  return <BaseBadge tone="slate">Ended</BaseBadge>;
}

export function OpenNowBadge({ open }: { open: boolean }) {
  return open
    ? <BaseBadge tone="blue">Open now</BaseBadge>
    : <BaseBadge tone="slate">Closed</BaseBadge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Role — users.role
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  lecturer: 'Lecturer',
  admin: 'Admin',
};

const ROLE_TONE: Record<Role, Tone> = {
  student: 'blue',
  lecturer: 'purple',
  admin: 'slate',
};

export function RoleBadge({ role }: { role: Role }) {
  return <BaseBadge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</BaseBadge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance attempt outcome — attendance_attempts.outcome
// ─────────────────────────────────────────────────────────────────────────────

const OUTCOME_LABEL: Record<AttemptOutcome, string> = {
  Accepted:               'Accepted',
  Rejected_Distance:      'Out of range',
  Rejected_MockGPS:       'Mock GPS',
  Rejected_Code:          'Bad code',
  Rejected_Accuracy:      'Weak GPS',
  Rejected_NotEnrolled:   'Not enrolled',
};

const OUTCOME_TONE: Record<AttemptOutcome, Tone> = {
  Accepted:               'green',
  Rejected_Distance:      'red',
  Rejected_MockGPS:       'red',
  Rejected_Code:          'amber',
  Rejected_Accuracy:      'amber',
  Rejected_NotEnrolled:   'red',
};

export function OutcomeBadge({ outcome }: { outcome: AttemptOutcome }) {
  return (
    <BaseBadge tone={OUTCOME_TONE[outcome]}>
      {OUTCOME_LABEL[outcome]}
    </BaseBadge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic — for one-off cases that don't warrant a typed component.
// Prefer the semantic ones above; use this only when nothing else fits.
// ─────────────────────────────────────────────────────────────────────────────

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <BaseBadge tone={tone}>{children}</BaseBadge>;
}