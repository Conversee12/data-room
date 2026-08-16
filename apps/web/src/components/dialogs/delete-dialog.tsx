'use client';

import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { formatBytes, pluralize, type SubtreeStats } from '@data-room/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogPanel } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/states';
import { describeError } from '@/lib/api';

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  kind: 'folder' | 'file' | 'data room';
  /** Undefined while still being counted. */
  stats?: SubtreeStats;
  statsLoading: boolean;
  onConfirm: () => Promise<unknown>;
}

/**
 * Deleting is the one action here that cannot be undone, so the dialog names
 * exactly what will go — counted from the server, not guessed from the page —
 * before the button becomes the obvious thing to press.
 */
export function DeleteDialog({
  open,
  onOpenChange,
  name,
  kind,
  stats,
  statsLoading,
  onConfirm,
}: DeleteDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (confirmError) {
      setError(describeError(confirmError));
    } finally {
      setDeleting(false);
    }
  };

  const contents = describeContents(stats);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPanel
        title={`Delete this ${kind}?`}
        className="max-w-md"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="danger" loading={deleting} onClick={confirm}>
              Delete {kind === 'file' ? 'file' : 'everything'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink">
            <span className="font-medium">{name}</span> will be permanently deleted.
          </p>

          {kind !== 'file' ? (
            <div className="rounded-lg border border-border bg-surface-muted/60 p-3.5">
              {statsLoading ? (
                <span className="flex items-center gap-2 text-sm text-ink-muted">
                  <Spinner />
                  Counting what is inside…
                </span>
              ) : contents ? (
                <div className="flex gap-2.5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p className="text-sm text-ink">
                    This also deletes {contents}. Anyone you shared these with will lose access.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">This {kind} is empty.</p>
              )}
            </div>
          ) : null}

          <p className="text-sm text-ink-muted">This cannot be undone.</p>

          {error ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </DialogPanel>
    </Dialog>
  );
}

/** "12 files and 3 folders (40.2 MB)", or null when there is nothing inside. */
function describeContents(stats?: SubtreeStats): string | null {
  if (!stats) return null;
  if (stats.fileCount === 0 && stats.folderCount === 0) return null;

  const parts: string[] = [];
  if (stats.fileCount > 0) parts.push(pluralize(stats.fileCount, 'file'));
  if (stats.folderCount > 0) parts.push(pluralize(stats.folderCount, 'folder'));

  const items = parts.join(' and ');
  return stats.totalSize > 0 ? `${items} (${formatBytes(stats.totalSize)})` : items;
}
