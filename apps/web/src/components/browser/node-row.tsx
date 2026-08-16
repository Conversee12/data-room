'use client';

import { Link2 } from 'lucide-react';
import Link from 'next/link';
import { formatBytes, type NodeDto } from '@data-room/shared';

import { Badge } from '@/components/ui/badge';
import { useAccess } from '@/lib/access-context';
import { NodeActions } from './node-actions';
import { NodeIcon } from './node-icon';

interface NodeRowProps {
  node: NodeDto;
  canWrite: boolean;
  rootId: string;
  rootName: string;
}

export function NodeRow({ node, canWrite, rootId, rootName }: NodeRowProps) {
  const { hrefFor } = useAccess();

  return (
    <li className="group relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted">
      <NodeIcon type={node.type} />

      {/* The row is one large target; the actions menu sits above it. */}
      <Link href={hrefFor(node.id)} className="absolute inset-0">
        <span className="sr-only">Open {node.name}</span>
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-ink">{node.name}</span>
          {node.isShared ? (
            <Badge tone="accent" className="relative shrink-0">
              <Link2 className="size-3" />
              Shared
            </Badge>
          ) : null}
          {node.versionCount && node.versionCount > 1 ? (
            <Badge className="relative shrink-0">v{node.versionCount}</Badge>
          ) : null}
        </div>
      </div>

      <span className="hidden shrink-0 text-sm text-ink-faint sm:block">
        {node.type === 'FILE' ? formatBytes(node.size) : '—'}
      </span>

      <span className="hidden w-28 shrink-0 text-sm text-ink-faint md:block">
        {formatDate(node.updatedAt)}
      </span>

      {canWrite ? (
        <NodeActions
          node={node}
          rootId={rootId}
          rootName={rootName}
          className="relative opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        />
      ) : (
        <span className="w-8 shrink-0" aria-hidden />
      )}
    </li>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
