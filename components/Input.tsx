'use client';

// components/Input.tsx
//
// Text / email / password / number input primitive. Handles label, hint,
// error, accessibility wiring, and a password-visibility toggle.

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
} from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  /** Helper text shown below the input when there is no error. */
  hint?: string;
  /** Error message. Overrides `hint` and sets aria-invalid. */
  error?: string;
  /** Render a leading "addon" — usually a unit or prefix. */
  leading?: string;
  /** Render a trailing "addon" — usually a unit or suffix. */
  trailing?: string;
  fullWidth?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    leading,
    trailing,
    fullWidth = true,
    className,
    type = 'text',
    id,
    disabled,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? `input-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const isPassword = type === 'password';
  const [reveal, setReveal] = useState(false);
  const effectiveType = isPassword && reveal ? 'text' : type;

  

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          {label}
        </label>
      )}

      <div
        className={[
          'flex items-stretch overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-inset',
          'focus-within:ring-2 focus-within:ring-inset',
          error
            ? 'ring-red-400 focus-within:ring-red-500'
            : 'ring-slate-300 focus-within:ring-brand-600',
          disabled ? 'bg-slate-50' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {leading && (
          <span className="flex select-none items-center bg-slate-50 px-3 text-sm text-slate-500">
            {leading}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          type={effectiveType}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            'block w-full border-0 bg-transparent px-3 py-2 text-slate-900',
            'placeholder:text-slate-400',
            'focus:outline-none',
            'disabled:cursor-not-allowed disabled:text-slate-500',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />

        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="flex select-none items-center px-3 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            {reveal ? 'Hide' : 'Show'}
          </button>
        )}

        {trailing && (
          <span className="flex select-none items-center bg-slate-50 px-3 text-sm text-slate-500">
            {trailing}
          </span>
        )}
      </div>

      {error ? (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}

      {/* hasAddon is unused as a direct branch but kept to guarantee that
          eslint doesn't flag leading/trailing as unused in future edits. */}
      
    </div>
  );
});