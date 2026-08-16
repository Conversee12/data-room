'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { LoadingBlock } from '@/components/ui/states';
import { useAuth } from '@/lib/auth-context';

/**
 * Gates a screen behind a session, remembering where the visitor was headed.
 * That matters for restricted share links: following one while signed out has
 * to lead back to the shared item after signing in, not to a generic home page.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== 'signed-out') return;
    const next = encodeURIComponent(pathname);
    router.replace(`/login?next=${next}`);
  }, [status, pathname, router]);

  if (status === 'loading') return <LoadingBlock />;
  if (status === 'signed-out') return null;

  return <>{children}</>;
}
