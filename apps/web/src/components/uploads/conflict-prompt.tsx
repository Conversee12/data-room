'use client';

import { pluralize, type ConflictPolicy } from '@data-room/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogPanel } from '@/components/ui/dialog';

interface ConflictPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names already present in the target folder. */
  names: string[];
  total: number;
  onResolve: (policy: ConflictPolicy) => void;
}

/**
 * Asked once per batch when some of the dropped files already exist.
 *
 * Neither answer loses data: "keep both" adds a numbered copy, and "new version"
 * keeps the previous bytes retrievable from the file's history.
 */
export function ConflictPrompt({
  open,
  onOpenChange,
  names,
  total,
  onResolve,
}: ConflictPromptProps) {
  const shown = names.slice(0, 5);
  const remaining = names.length - shown.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPanel
        title={names.length === 1 ? 'That file already exists' : 'Some files already exist'}
        description={
          total > names.length
            ? `${pluralize(names.length, 'of the file', 'of the files')} you dropped ${
                names.length === 1 ? 'is' : 'are'
              } already in this folder.`
            : undefined
        }
        className="max-w-md"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="secondary" onClick={() => onResolve('rename')}>
              Keep both
            </Button>
            <Button variant="primary" onClick={() => onResolve('version')}>
              Upload as new version
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5">
          {shown.map((name) => (
            <li key={name} className="truncate text-sm text-ink">
              {name}
            </li>
          ))}
          {remaining > 0 ? (
            <li className="text-sm text-ink-muted">and {remaining} more</li>
          ) : null}
        </ul>

        <p className="mt-4 text-sm text-ink-muted">
          <strong className="font-medium text-ink">Keep both</strong> adds a numbered copy.{' '}
          <strong className="font-medium text-ink">Upload as new version</strong> replaces what
          people see while keeping the earlier version in the file&rsquo;s history.
        </p>
      </DialogPanel>
    </Dialog>
  );
}
