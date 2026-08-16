'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink',
          'placeholder:text-ink-faint',
          'focus:border-accent focus:outline-none',
          'aria-[invalid=true]:border-danger',
          'disabled:opacity-60',
          className,
        )}
        {...props}
      />
    );
  },
);

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Shown under the input and announced to screen readers. */
  error?: string;
  hint?: ReactNode;
}

/**
 * Label, input and error message wired together. Bundling them means an input
 * can never ship without its label or without announcing its own error.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, className, ...props },
  ref,
) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="space-y-1.5">
      <LabelPrimitive.Root htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </LabelPrimitive.Root>
      <Input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={className}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
