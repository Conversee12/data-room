'use client';

import { Eye } from 'lucide-react';
import { useParams } from 'next/navigation';
import type { ShareContext } from '@data-room/shared';

import { NodeScreen } from '@/components/browser/node-screen';
import { ShareGate } from '@/components/sharing/share-gate';
import { AccessProvider } from '@/lib/access-context';

/** Browsing inside a shared data room, folder or file. */
export default function SharedNodePage() {
  const params = useParams<{ token: string; nodeId: string }>();

  return (
    <AccessProvider shareToken={params.token}>
      <ShareGate token={params.token}>
        {(context) => (
          <NodeScreen nodeId={params.nodeId} banner={<SharedBanner context={context} />} />
        )}
      </ShareGate>
    </AccessProvider>
  );
}

/**
 * Says plainly whose document this is and that it cannot be changed, so a
 * visitor is never left guessing why there are no editing controls.
 */
function SharedBanner({ context }: { context: ShareContext }) {
  return (
    <div className="mb-5 flex items-center gap-2.5 rounded-card border border-border bg-surface-muted/60 px-4 py-3">
      <Eye className="size-4 shrink-0 text-ink-faint" aria-hidden />
      <p className="text-sm text-ink-muted">
        <span className="font-medium text-ink">{context.sharedBy.name}</span> shared{' '}
        {context.share.isDataRoomShare ? 'this data room' : `“${context.node.name}”`} with you.
        You have view-only access.
      </p>
    </div>
  );
}
