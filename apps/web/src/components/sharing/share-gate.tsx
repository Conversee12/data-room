'use client';

import { Link2Off, Lock, ShieldX } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { ShareContext } from '@data-room/shared';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { ApiRequestError, describeError } from '@/lib/api';
import { useShareContext } from '@/lib/queries';

/**
 * Resolves a share link before anything is rendered behind it.
 *
 * Each way a link can fail gets its own answer, because "not found" for all of
 * them would leave the visitor unable to tell whether to sign in, ask for
 * access, or ask for a new link.
 */
export function ShareGate({
  token,
  children,
}: {
  token: string;
  children: (context: ShareContext) => ReactNode;
}) {
  const { data, isLoading, isError, error } = useShareContext(token);
  const pathname = usePathname();

  if (isLoading) return <LoadingBlock label="Opening shared item" />;

  if (isError) {
    const code = error instanceof ApiRequestError ? error.code : null;

    if (code === 'UNAUTHENTICATED') {
      return (
        <Centered>
          <EmptyState
            icon={Lock}
            title="Sign in to open this"
            description="Whoever shared this limited it to specific people, so we need to know who you are."
            action={
              <Button asChild variant="primary">
                <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</Link>
              </Button>
            }
          />
        </Centered>
      );
    }

    if (code === 'FORBIDDEN') {
      return (
        <Centered>
          <EmptyState
            icon={ShieldX}
            title="You do not have access"
            description="This link only works for the people it was shared with. Ask them to add your email address."
          />
        </Centered>
      );
    }

    if (code === 'SHARE_REVOKED' || code === 'SHARE_EXPIRED' || code === 'NOT_FOUND') {
      return (
        <Centered>
          <EmptyState
            icon={Link2Off}
            title={
              code === 'SHARE_EXPIRED'
                ? 'This link has expired'
                : code === 'SHARE_REVOKED'
                  ? 'This link was turned off'
                  : 'This link does not work'
            }
            description="Ask whoever shared it with you for a new one."
          />
        </Centered>
      );
    }

    return (
      <Centered>
        <ErrorState description={describeError(error)} />
      </Centered>
    );
  }

  if (!data) return null;
  return <>{children(data)}</>;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-card border border-border bg-surface">{children}</div>
    </div>
  );
}
