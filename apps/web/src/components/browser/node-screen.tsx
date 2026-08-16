'use client';

import { FileQuestion, Link2Off } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AppHeader } from '@/components/app-header';
import { ShareDialog } from '@/components/sharing/share-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { UploadPanel } from '@/components/uploads/upload-panel';
import { ApiRequestError, describeError } from '@/lib/api';
import { useNode } from '@/lib/queries';
import { FileView } from './file-view';
import { FolderView } from './folder-view';
import { SearchBox } from './search-box';
import { SearchResults } from './search-results';

interface NodeScreenProps {
  nodeId: string;
  /** Rendered above the content when browsing through a share link. */
  banner?: React.ReactNode;
}

/**
 * One screen for folders and files, for owners and for people following a share
 * link. Which of those applies is decided by what the API returns, not by the
 * route, so there is a single place where "what am I looking at and what may I
 * do with it" is answered.
 */
export function NodeScreen({ nodeId, banner }: NodeScreenProps) {
  const [term, setTerm] = useState('');
  const [sharing, setSharing] = useState(false);
  const { data, isLoading, isError, error, refetch } = useNode(nodeId);

  if (isLoading) {
    return (
      <>
        <AppHeader />
        <LoadingBlock />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <NodeError error={error} onRetry={refetch} />
        </main>
      </>
    );
  }

  if (!data) return null;

  const { node, access, dataRoom } = data;
  const isFolder = node.type === 'FOLDER';
  const searching = term.trim().length > 0;

  return (
    <>
      <AppHeader>
        {/* Searching is scoped to whatever the caller can reach: the whole data
            room for its owner, the shared subtree for a viewer. */}
        <SearchBox
          value={term}
          onChange={setTerm}
          placeholder={access.role === 'OWNER' ? `Search ${dataRoom.name}` : 'Search shared items'}
        />
      </AppHeader>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {banner}

        {searching ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              Results for <span className="font-medium text-ink">“{term.trim()}”</span>
            </p>
            <SearchResults
              dataRoomId={node.dataRoomId}
              term={term}
              scopeNodeId={access.scopeNodeId}
            />
          </div>
        ) : isFolder ? (
          <FolderView
            detail={data}
            rootId={access.scopeNodeId}
            rootName={dataRoom.name}
            onShare={() => setSharing(true)}
          />
        ) : (
          <FileView
            detail={data}
            rootId={access.scopeNodeId}
            rootName={dataRoom.name}
            onShare={() => setSharing(true)}
          />
        )}
      </main>

      {access.canShare ? (
        <ShareDialog
          open={sharing}
          onOpenChange={setSharing}
          node={node}
          isDataRoom={node.parentId === null}
        />
      ) : null}

      <UploadPanel />
    </>
  );
}

/**
 * The failures worth distinguishing. "Deleted while you were looking at it" is
 * the common one here: a folder can disappear under someone it was shared with.
 */
function NodeError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error instanceof ApiRequestError ? error.code : null;

  if (code === 'NOT_FOUND') {
    return (
      <EmptyState
        icon={FileQuestion}
        title="This item is no longer here"
        description="It was deleted, moved out of reach, or the link you followed is no longer valid."
        action={
          <Button asChild variant="secondary">
            <Link href="/">Go to your data rooms</Link>
          </Button>
        }
      />
    );
  }

  if (code === 'SHARE_REVOKED' || code === 'SHARE_EXPIRED') {
    return (
      <EmptyState
        icon={Link2Off}
        title={code === 'SHARE_EXPIRED' ? 'This link has expired' : 'This link was turned off'}
        description="Ask whoever shared it with you for a new one."
        action={
          <Button asChild variant="secondary">
            <Link href="/">Go to your data rooms</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ErrorState
      description={describeError(error)}
      action={<Button onClick={onRetry}>Try again</Button>}
    />
  );
}
