'use client';

import { CheckCircle2, ChevronDown, RotateCcw, X, XCircle } from 'lucide-react';
import { useState } from 'react';
import { formatBytes, pluralize } from '@data-room/shared';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useUploads, type UploadItem } from '@/lib/upload-context';

/**
 * A single panel for every upload in the session, pinned to the corner.
 *
 * It follows the user across folders on purpose: uploads keep running after you
 * navigate away, so the progress has to stay visible rather than living inside
 * the folder that started it.
 */
export function UploadPanel() {
  const { items, activeCount, clearFinished } = useUploads();
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  const done = items.filter((item) => item.state === 'done').length;
  const failed = items.filter((item) => item.state === 'failed').length;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-border bg-surface shadow-xl">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <p className="flex-1 text-sm font-medium text-ink">{summary(activeCount, done, failed)}</p>

        {activeCount === 0 ? (
          <Button variant="ghost" size="icon" onClick={clearFinished} aria-label="Clear finished uploads">
            <X />
          </Button>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Show uploads' : 'Hide uploads'}
        >
          <ChevronDown className={cn('transition-transform', collapsed && 'rotate-180')} />
        </Button>
      </div>

      {!collapsed ? (
        <ul className="max-h-72 divide-y divide-border overflow-y-auto">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function UploadRow({ item }: { item: UploadItem }) {
  const { cancel, retry, dismiss } = useUploads();
  const percent = Math.round(item.progress * 100);

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <StateIcon item={item} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{item.name}</p>
          <p className="truncate text-xs text-ink-muted">{detail(item, percent)}</p>
        </div>

        {item.state === 'uploading' || item.state === 'queued' ? (
          <Button variant="ghost" size="icon" onClick={() => cancel(item.id)} aria-label="Cancel upload">
            <X />
          </Button>
        ) : item.state === 'failed' ? (
          <Button variant="ghost" size="icon" onClick={() => retry(item.id)} aria-label="Retry upload">
            <RotateCcw />
          </Button>
        ) : item.state === 'cancelled' ? (
          <Button variant="ghost" size="icon" onClick={() => dismiss(item.id)} aria-label="Dismiss">
            <X />
          </Button>
        ) : null}
      </div>

      {item.state === 'uploading' || item.state === 'finishing' ? (
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Uploading ${item.name}`}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200"
            style={{ width: `${item.state === 'finishing' ? 100 : percent}%` }}
          />
        </div>
      ) : null}
    </li>
  );
}

function StateIcon({ item }: { item: UploadItem }) {
  if (item.state === 'done') return <CheckCircle2 className="size-4 shrink-0 text-success" />;
  if (item.state === 'failed') return <XCircle className="size-4 shrink-0 text-danger" />;
  if (item.state === 'cancelled') return <XCircle className="size-4 shrink-0 text-ink-faint" />;
  return (
    <span className="grid size-4 shrink-0 place-items-center">
      <span className="size-2 animate-pulse rounded-full bg-accent" />
    </span>
  );
}

function detail(item: UploadItem, percent: number): string {
  switch (item.state) {
    case 'queued':
      return 'Waiting…';
    case 'uploading':
      return `${percent}% of ${formatBytes(item.file.size)}`;
    case 'finishing':
      return 'Finishing…';
    case 'done':
      return formatBytes(item.file.size);
    case 'cancelled':
      return 'Cancelled';
    case 'failed':
      return item.error ?? 'Upload failed';
  }
}

function summary(active: number, done: number, failed: number): string {
  if (active > 0) return `Uploading ${pluralize(active, 'file')}…`;
  if (failed > 0 && done > 0) return `${done} uploaded, ${failed} failed`;
  if (failed > 0) return `${pluralize(failed, 'upload')} failed`;
  return `${pluralize(done, 'file')} uploaded`;
}
