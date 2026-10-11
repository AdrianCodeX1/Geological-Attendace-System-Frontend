'use client';

// components/Alert.tsx
//
// Inline banner for API errors, warnings, info, and success messages.
//
// Two usage patterns:
//   1. <AlertFromError error={err} />        — from a catch block
//   2. <Alert tone="warning">Custom copy</Alert> — hand-written messages

import type { ReactNode } from 'react';
import type { ApiError } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Base alert
// ─────────────────────────────────────────────────────────────────────────────

export type AlertTone = 'error' | 'warning' | 'info' | 'success';

const TONE_CLASSES: Record<AlertTone, string> = {
  error:   'bg-red-50   text-red-800   ring-red-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  info:    'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-green-50 text-green-800 ring-green-200',
};

const ICON_TONE: Record<AlertTone, string> = {
  error:   'text-red-500',
  warning: 'text-amber-500',
  info:    'text-brand-500',
  success: 'text-green-500',
};

export type AlertProps = {
  tone: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Bulleted list rendered below the body. */
  details?: string[];
  className?: string;
};

export function Alert({
  tone,
  title,
  children,
  details,
  className,
}: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={[
        'rounded-md px-3 py-2.5 text-sm ring-1 ring-inset',
        TONE_CLASSES[tone],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <AlertIcon tone={tone} />
        <div className="min-w-0 flex-1">
          {title && <p className="font-medium">{title}</p>}
          {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
          {details && details.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs">
              {details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Error adapter — turn an ApiError into an Alert
// ─────────────────────────────────────────────────────────────────────────────

export function AlertFromError({
  error,
  className,
}: {
  error: ApiError;
  className?: string;
}) {
  return (
    <Alert
      tone="error"
      title={error.error}
      details={error.details}
      className={className}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons — inline SVG, currentColor themed per tone
// ─────────────────────────────────────────────────────────────────────────────

function AlertIcon({ tone }: { tone: AlertTone }) {
  const cls = `h-4 w-4 shrink-0 mt-0.5 ${ICON_TONE[tone]}`;
  const common = {
    viewBox: '0 0 20 20',
    fill: 'currentColor',
    'aria-hidden': true as const,
    className: cls,
  };

  if (tone === 'success') {
    return (
      <svg {...common}>
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (tone === 'info') {
    return (
      <svg {...common}>
        <path
          fillRule="evenodd"
          d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.25v3.5H9a.75.75 0 0 0 0 1.5h2a.75.75 0 0 0 0-1.5h-.25V9.75A.75.75 0 0 0 10 9H9Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  // error + warning share the triangle-with-exclamation glyph.
  return (
    <svg {...common}>
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}