'use client';

import { FolderOpen, Share2, Upload } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { toNameKey, type NodeDetail } from '@data-room/shared';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, RowSkeleton } from '@/components/ui/states';
import { UploadDropzone } from '@/components/uploads/upload-dropzone';
import { useFileOffer } from '@/components/uploads/use-file-offer';
import { describeError } from '@/lib/api';
import { useChildren } from '@/lib/queries';
import { Breadcrumbs } from './breadcrumbs';
import { NewFolderDialog } from './new-folder-dialog';
import { NodeRow } from './node-row';

interface FolderViewProps {
  detail: NodeDetail;
  rootId: string;
  rootName: string;
  onShare: () => void;
}

export function FolderView({ detail, rootId, rootName, onShare }: FolderViewProps) {
  const { node, breadcrumbs, access } = detail;
  const canWrite = access.canWrite;

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useChildren(node.id);
  const filePicker = useRef<HTMLInputElement>(null);

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  // Used to spot name clashes before an upload starts. It only covers what has
  // been loaded; the API remains the authority and resolves anything missed.
  const existingNameKeys = useMemo(
    () => new Set(items.map((item) => toNameKey(item.name))),
    [items],
  );

  const { offer, prompt } = useFileOffer(node.id, existingNameKeys);

  const listing = (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {isLoading ? (
        <RowSkeleton />
      ) : isError ? (
        <ErrorState title="Could not load this folder" description={describeError(error)} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="This folder is empty"
          description={
            canWrite
              ? 'Drag PDFs onto this page to upload them, or create a folder first.'
              : 'Nothing has been added here yet.'
          }
          action={
            canWrite ? (
              <Button variant="primary" onClick={() => filePicker.current?.click()}>
                <Upload />
                Upload files
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <NodeRow
                key={item.id}
                node={item}
                canWrite={canWrite}
                rootId={rootId}
                rootName={rootName}
              />
            ))}
          </ul>

          {hasNextPage ? (
            <div className="border-t border-border p-3 text-center">
              <Button variant="ghost" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs crumbs={breadcrumbs} />

        {canWrite ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={onShare}>
              <Share2 />
              <span className="hidden sm:inline">Share</span>
            </Button>
            <NewFolderDialog parentId={node.id} />
            <Button variant="primary" onClick={() => filePicker.current?.click()}>
              <Upload />
              <span className="hidden sm:inline">Upload</span>
            </Button>
          </div>
        ) : null}
      </div>

      {canWrite ? (
        <>
          <input
            ref={filePicker}
            type="file"
            multiple
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              offer(Array.from(event.target.files ?? []));
              // Cleared so choosing the same file twice still fires a change.
              event.target.value = '';
            }}
          />

          <UploadDropzone onFiles={offer}>{listing}</UploadDropzone>
          {prompt}
        </>
      ) : (
        listing
      )}
    </div>
  );
}
