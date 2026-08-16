'use client';

import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { formatBytes } from '@data-room/shared';

import { EmptyState, ErrorState, RowSkeleton } from '@/components/ui/states';
import { describeError } from '@/lib/api';
import { useAccess } from '@/lib/access-context';
import { useSearch } from '@/lib/queries';
import { NodeIcon } from './node-icon';

interface SearchResultsProps {
  dataRoomId: string;
  term: string;
  /** Limits the search to what the caller can reach. */
  scopeNodeId: string;
}

export function SearchResults({ dataRoomId, term, scopeNodeId }: SearchResultsProps) {
  const { hrefFor } = useAccess();
  const { data, isLoading, isError, error } = useSearch(dataRoomId, term, scopeNodeId);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {isLoading ? (
        <RowSkeleton rows={3} />
      ) : isError ? (
        <ErrorState title="Search failed" description={describeError(error)} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={`Nothing matches “${term}”`}
          description="Try part of a file or folder name."
        />
      ) : (
        <ul className="divide-y divide-border">
          {data.items.map((hit) => (
            <li key={hit.node.id}>
              <Link
                href={hrefFor(hit.node.id)}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted"
              >
                <NodeIcon type={hit.node.type} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{hit.node.name}</p>
                  {/* Where it lives, so two files with the same name are
                      distinguishable without opening them. */}
                  <p className="truncate text-xs text-ink-muted">
                    {hit.breadcrumbs.map((crumb) => crumb.name).join(' / ') || 'Top level'}
                  </p>
                </div>

                <span className="shrink-0 text-sm text-ink-faint">
                  {hit.node.type === 'FILE' ? formatBytes(hit.node.size) : 'Folder'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
