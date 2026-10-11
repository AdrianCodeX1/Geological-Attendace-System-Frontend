// components/Card.tsx
//
// Panel primitive used by every dashboard section. Composed from four parts
// so pages can add a header / footer only when they need one.

import type { ReactNode } from 'react';

export type CardProps = {
  children: ReactNode;
  /** Semantic element. Defaults to <div>. */
  as?: 'div' | 'section' | 'article' | 'li' | 'aside';
  className?: string;
};

export function Card({ children, as: Tag = 'div', className }: CardProps) {
  return (
    <Tag
      className={[
        'rounded-lg bg-white shadow-sm ring-1 ring-slate-200',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Tag>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export type CardHeaderProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned slot — badges, buttons, countdowns. */
  right?: ReactNode;
  className?: string;
};

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: CardHeaderProps) {
  if (!title && !subtitle && !right) return null;

  return (
    <div
      className={[
        'flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="min-w-0">
        {title && (
          <h2 className="truncate text-sm font-semibold text-slate-900">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        )}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export type CardBodyProps = {
  children: ReactNode;
  /** Applies standard padding. Set false for edge-to-edge content (tables). */
  padded?: boolean;
  className?: string;
};

export function CardBody({
  children,
  padded = true,
  className,
}: CardBodyProps) {
  return (
    <div
      className={[padded ? 'p-4 sm:p-5' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export type CardFooterProps = {
  children: ReactNode;
  className?: string;
};

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div
      className={[
        'flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}