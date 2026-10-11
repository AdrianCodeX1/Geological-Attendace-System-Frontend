'use client';

// components/Spinner.tsx
//
// Standalone loading indicator. The Button component has its own private
// spinner; this one is for page-level and section-level loading states.

export type SpinnerSize = 'sm' | 'md' | 'lg';

export type SpinnerProps = {
  size?: SpinnerSize;
  /** Visible text below the spinner, and its accessible label. */
  label?: string;
  /** Renders spinner + label horizontally (useful inside toolbars). */
  inline?: boolean;
  className?: string;
};

const DIMENSION: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
};

const LABEL_SIZE: Record<SpinnerSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export function Spinner({
  size = 'md',
  label,
  inline = false,
  className,
}: SpinnerProps) {
  const dimension = DIMENSION[size];
  const labelSize = LABEL_SIZE[size];
  const accessibleLabel = label ?? 'Loading…';

  const svg = (
    <svg
      className={`${dimension} animate-spin text-brand-600`}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={accessibleLabel}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M4 12a8 8 0 0 1 8-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-90"
      />
    </svg>
  );

  if (inline) {
    return (
      <div
        className={[
          'inline-flex items-center gap-2 text-slate-500',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {svg}
        {label && <span className={labelSize}>{label}</span>}
      </div>
    );
  }

  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 text-slate-500',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {svg}
      {label && <span className={labelSize}>{label}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Full-screen variant — used by RequireAuth during bootstrap and by
// any page that's waiting on a mandatory first load.
// ─────────────────────────────────────────────────────────────────────────────

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner size="lg" label={label ?? 'Loading…'} />
    </div>
  );
}