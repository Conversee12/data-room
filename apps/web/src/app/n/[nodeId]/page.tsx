'use client';

import { useParams } from 'next/navigation';

import { NodeScreen } from '@/components/browser/node-screen';
import { RequireAuth } from '@/components/require-auth';
import { AccessProvider } from '@/lib/access-context';

/** Browsing as the signed-in owner, or as someone a share was granted to. */
export default function NodePage() {
  const params = useParams<{ nodeId: string }>();

  return (
    <RequireAuth>
      <AccessProvider shareToken={null}>
        <NodeScreen nodeId={params.nodeId} />
      </AccessProvider>
    </RequireAuth>
  );
}
