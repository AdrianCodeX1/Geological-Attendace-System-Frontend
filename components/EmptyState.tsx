// components/EmptyState.tsx
//
// Centered "no data" panel for list views. Ships with a small set of preset
// icons covering every empty state in the app; use `iconSlot` for custom art.

import type { ReactNode } from 'react';

export type EmptyStateIcon =
  | 'sessions'
  | 'history'
  | 'schedule'
  | 'people'
  | 'search';

export type EmptyStateProps = {
  icon?: EmptyStateIcon;
  /** Escape hatch for a custom icon; takes precedence over `icon`. */
  iconSlot?: ReactNode;
  title: string;
  description?: string;
  /** Optional action, usually a <Button> or a Next <Link>. */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon = 'search',
  iconSlot,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center px-6 py-10 text-center',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {iconSlot ?? <PresetIcon name={icon} />}
      </div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset icons — small inline SVGs; no external icon dependency.
// ─────────────────────────────────────────────────────────────────────────────

function PresetIcon({ name }: { name: EmptyStateIcon }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'h-6 w-6',
    'aria-hidden': true as const,
  };

  switch (name) {
    case 'sessions':
      // A play icon inside a rounded square — "nothing is live right now".
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M10 8.5v7l6-3.5-6-3.5Z" />
        </svg>
      );

    case 'history':
      // Clock with a rewind arrow — "no past records".
      return (
        <svg {...common}>
          <path d="M3.05 11a9 9 0 1 1 .5 4" />
          <path d="M3 4v4h4" />
          <path d="M12 7v5l3 2" />
        </svg>
      );

    case 'schedule':
      // Calendar — "no timetable slots".
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 3v4M16 3v4" />
        </svg>
      );

    case 'people':
      // Two-person group — "no students / users".
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.25" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.5a2.75 2.75 0 0 1 0 5.5" />
          <path d="M17.5 14.2A5.5 5.5 0 0 1 20.5 19" />
        </svg>
      );

    case 'search':
    default:
      // Magnifier — generic "nothing found".
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m20 20-4.5-4.5" />
        </svg>
      );
  }
}