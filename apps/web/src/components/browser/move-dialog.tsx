'use client';

import { ChevronRight, CornerLeftUp, Folder } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { NodeDto } from '@data-room/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogPanel } from '@/components/ui/dialog';
import { EmptyState, LoadingBlock } from '@/components/ui/states';
import { describeError, isErrorCode } from '@/lib/api';
import { useChildren, useMoveNode } from '@/lib/queries';

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: NodeDto;
  /** Where the picker starts: the data room's root folder. */
  rootId: string;
  rootName: string;
  currentParentId: string;
}

interface Crumb {
  id: string;
  name: string;
}

/**
 * A drill-down folder picker.
 *
 * Moving a folder into its own subtree would detach that subtree from the root,
 * so the only way to reach a descendant is by walking through the folder itself
 * — which makes "is the moved folder anywhere in the path I opened" a complete
 * check, with no extra data to fetch.
 */
export function MoveDialog({
  open,
  onOpenChange,
  node,
  rootId,
  rootName,
  currentParentId,
}: MoveDialogProps) {
  const [trail, setTrail] = useState<Crumb[]>([{ id: rootId, name: rootName }]);
  const [error, setError] = useState<string | null>(null);

  const move = useMoveNode();
  const here = trail[trail.length - 1]!;
  const { data, isLoading } = useChildren(open ? here.id : null);

  useEffect(() => {
    if (open) {
      setTrail([{ id: rootId, name: rootName }]);
      setError(null);
    }
  }, [open, rootId, rootName]);

  const folders = (data?.pages.flatMap((page) => page.items) ?? []).filter(
    (item) => item.type === 'FOLDER',
  );

  const insideItself = trail.some((crumb) => crumb.id === node.id);
  const alreadyHere = here.id === currentParentId;
  const canDrop = !insideItself && !alreadyHere;

  const submit = async () => {
    setError(null);
    try {
      await move.mutateAsync({
        nodeId: node.id,
        parentId: here.id,
        fromParentId: currentParentId,
      });
      onOpenChange(false);
    } catch (moveError) {
      setError(
        isErrorCode(moveError, 'NAME_CONFLICT')
          ? `“${node.name}” already exists in that folder. Rename it first.`
          : describeError(moveError),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPanel
        title={`Move “${node.name}”`}
        description="Choose where it should go."
        className="max-w-lg"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="primary" disabled={!canDrop} loading={move.isPending} onClick={submit}>
              Move here
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-surface-muted px-2 py-1.5 text-sm">
            {trail.map((crumb, index) => (
              <div key={crumb.id} className="flex shrink-0 items-center gap-1">
                {index > 0 ? (
                  <ChevronRight className="size-3.5 text-ink-faint" aria-hidden />
                ) : null}
                <button
                  type="button"
                  onClick={() => setTrail((current) => current.slice(0, index + 1))}
                  className="max-w-40 truncate rounded px-1.5 py-0.5 text-ink-muted transition-colors hover:text-ink disabled:text-ink"
                  disabled={index === trail.length - 1}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>

          <div className="h-64 overflow-y-auto rounded-lg border border-border">
            {trail.length > 1 ? (
              <button
                type="button"
                onClick={() => setTrail((current) => current.slice(0, -1))}
                className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-muted"
              >
                <CornerLeftUp className="size-4" />
                Back to {trail[trail.length - 2]!.name}
              </button>
            ) : null}

            {isLoading ? (
              <LoadingBlock label="Loading folders" />
            ) : folders.length === 0 ? (
              <EmptyState
                icon={Folder}
                title="No folders here"
                description="You can still move it into this folder."
                className="py-10"
              />
            ) : (
              <ul className="divide-y divide-border">
                {folders.map((folder) => {
                  const isSelf = folder.id === node.id;
                  return (
                    <li key={folder.id}>
                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() =>
                          setTrail((current) => [...current, { id: folder.id, name: folder.name }])
                        }
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Folder className="size-4 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1 truncate text-ink">{folder.name}</span>
                        {isSelf ? (
                          <span className="text-xs text-ink-faint">this folder</span>
                        ) : (
                          <ChevronRight className="size-4 shrink-0 text-ink-faint" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {insideItself ? (
            <p className="text-sm text-ink-muted">
              A folder cannot be moved inside itself. Go back up to choose somewhere else.
            </p>
          ) : alreadyHere ? (
            <p className="text-sm text-ink-muted">It is already in this folder.</p>
          ) : null}

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
