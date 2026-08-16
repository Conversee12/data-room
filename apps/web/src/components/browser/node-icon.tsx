import { FileText, Folder } from 'lucide-react';
import type { NodeType } from '@data-room/shared';

import { cn } from '@/lib/cn';

export function NodeIcon({ type, className }: { type: NodeType; className?: string }) {
  const Icon = type === 'FOLDER' ? Folder : FileText;

  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-md',
        type === 'FOLDER' ? 'bg-accent-soft' : 'bg-surface-muted',
        className,
      )}
    >
      <Icon
        className={cn('size-4', type === 'FOLDER' ? 'text-accent' : 'text-ink-muted')}
        aria-hidden
      />
    </span>
  );
}
