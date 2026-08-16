'use client';

import { FileText, Folder, Users } from 'lucide-react';
import Link from 'next/link';
import type { SharedWithMeItem } from '@data-room/shared';

import { Badge } from '@/components/ui/badge';
import { useSharedWithMe } from '@/lib/queries';

/**
 * Items other people granted this account access to. Public links are absent on
 * purpose: nobody was named on them, so they are not "shared with you".
 */
export function SharedWithMe() {
  const { data, isLoading } = useSharedWithMe();

  if (isLoading || !data || data.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
        <Users className="size-4 text-ink-faint" />
        Shared with me
      </h2>

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {data.map((item) => (
          <SharedRow key={item.share.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function SharedRow({ item }: { item: SharedWithMeItem }) {
  const isFolder = item.node.type === 'FOLDER';
  const Icon = isFolder ? Folder : FileText;

  return (
    <li>
      <Link
        href={`/s/${item.share.token}/${item.node.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
      >
        <Icon className={isFolder ? 'size-5 text-accent' : 'size-5 text-ink-faint'} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{item.node.name}</p>
          <p className="truncate text-xs text-ink-muted">
            {item.share.isDataRoomShare ? 'Whole data room' : item.dataRoom.name} · shared by{' '}
            {item.sharedBy.name}
          </p>
        </div>

        <Badge>View only</Badge>
      </Link>
    </li>
  );
}
