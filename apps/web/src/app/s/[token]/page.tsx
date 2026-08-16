'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { ShareGate } from '@/components/sharing/share-gate';
import { LoadingBlock } from '@/components/ui/states';
import { AccessProvider } from '@/lib/access-context';

/**
 * The address people are actually given. It resolves which node the link points
 * at and hands over to the browsing route, so the URL a visitor keeps stays
 * short and the share token is never confused with a node id.
 */
export default function ShareEntryPage() {
  const params = useParams<{ token: string }>();

  return (
    <AccessProvider shareToken={params.token}>
      <ShareGate token={params.token}>
        {(context) => <RedirectToNode token={params.token} nodeId={context.node.id} />}
      </ShareGate>
    </AccessProvider>
  );
}

function RedirectToNode({ token, nodeId }: { token: string; nodeId: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/s/${token}/${nodeId}`);
  }, [router, token, nodeId]);

  return <LoadingBlock label="Opening shared item" />;
}
