'use client';

import { Vault } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { loginSchema, registerSchema } from '@data-room/shared';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ApiRequestError, describeError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type Mode = 'sign-in' | 'sign-up';

const copy = {
  'sign-in': {
    title: 'Sign in',
    subtitle: 'Open your data rooms and anything shared with you.',
    submit: 'Sign in',
    switchText: 'New here?',
    switchLabel: 'Create an account',
    switchHref: '/register',
  },
  'sign-up': {
    title: 'Create an account',
    subtitle: 'Your data rooms are private until you share them.',
    submit: 'Create account',
    switchText: 'Already have an account?',
    switchLabel: 'Sign in',
    switchHref: '/login',
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const { status, signIn, signUp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const text = copy[mode];

  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Whoever was sent here from a share link goes back to it, not to the home page.
  const next = searchParams.get('next');
  const destination = next && next.startsWith('/') ? next : '/';

  useEffect(() => {
    if (status === 'signed-in') router.replace(destination);
  }, [status, destination, router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const schema = mode === 'sign-up' ? registerSchema : loginSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      // The same schema the API validates against, so the two never disagree.
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      if (mode === 'sign-up') await signUp(parsed.data as never);
      else await signIn(parsed.data as never);
      router.replace(destination);
    } catch (error) {
      if (error instanceof ApiRequestError && error.details) {
        const fieldErrors: Record<string, string> = {};
        for (const [field, messages] of Object.entries(error.details)) {
          if (messages[0]) fieldErrors[field] = messages[0];
        }
        setErrors(fieldErrors);
      }
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex rounded-xl bg-accent-soft p-3">
            <Vault className="size-6 text-accent" />
          </div>
          <h1 className="text-xl font-semibold text-ink">{text.title}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{text.subtitle}</p>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4">
          {mode === 'sign-up' ? (
            <Field
              label="Name"
              autoComplete="name"
              value={values.name}
              error={errors.name}
              onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
            />
          ) : null}

          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={values.email}
            error={errors.email}
            onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
          />

          <Field
            label="Password"
            type="password"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            value={values.password}
            error={errors.password}
            hint={mode === 'sign-up' ? 'At least 8 characters.' : undefined}
            onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
          />

          {formError ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}

          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            {text.submit}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          {text.switchText}{' '}
          <Link
            href={next ? `${text.switchHref}?next=${encodeURIComponent(next)}` : text.switchHref}
            className="font-medium text-accent hover:underline"
          >
            {text.switchLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
