'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { BreadcrumbDto } from '@data-room/shared';

import { useAccess } from '@/lib/access-context';

/**
 * The trail already stops at whatever the caller is allowed to see, so a viewer
 * given one folder never sees the names of the folders above it. On narrow
 * screens the middle collapses rather than wrapping to a second line.
 */
export function Breadcrumbs({ crumbs }: { crumbs: BreadcrumbDto[] }) {
  const { hrefFor } = useAccess();
  if (crumbs.length === 0) return null;

  const current = crumbs[crumbs.length - 1]!;
  const ancestors = crumbs.slice(0, -1);
  const collapsed = ancestors.length > 2;
  const shown = collapsed ? [ancestors[0]!, ancestors[ancestors.length - 1]!] : ancestors;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm">
        {shown.map((crumb, index) => (
          <li key={crumb.id} className="flex min-w-0 items-center gap-1">
            <Link
              href={hrefFor(crumb.id)}
              className="max-w-40 truncate rounded px-1.5 py-1 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              {crumb.name}
            </Link>
            <ChevronRight className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
            {collapsed && index === 0 ? (
              <>
                <span className="px-1 text-ink-faint" aria-label="Skipped folders">
                  …
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
              </>
            ) : null}
          </li>
        ))}

        <li className="min-w-0">
          <span
            aria-current="page"
            className="block max-w-64 truncate px-1.5 py-1 font-medium text-ink"
          >
            {current.name}
          </span>
        </li>
      </ol>
    </nav>
  );
}
