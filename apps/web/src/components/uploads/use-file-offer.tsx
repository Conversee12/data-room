'use client';

import { useCallback, useState } from 'react';
import { toNameKey, type ConflictPolicy } from '@data-room/shared';

import { useUploads } from '@/lib/upload-context';
import { ConflictPrompt } from './conflict-prompt';

/**
 * Accepting files, wherever they came from.
 *
 * Dropping files and picking them from the file dialog must behave identically —
 * including asking before anything is overwritten — so both routes go through
 * this one place rather than each deciding for itself.
 */
export function useFileOffer(parentId: string, existingNameKeys: Set<string>) {
  const { enqueue } = useUploads();
  const [pending, setPending] = useState<{ files: File[]; clashes: string[] } | null>(null);

  const offer = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const clashes = files
        .filter((file) => existingNameKeys.has(toNameKey(file.name)))
        .map((file) => file.name);

      if (clashes.length > 0) setPending({ files, clashes });
      else enqueue(files, parentId, 'rename');
    },
    [enqueue, existingNameKeys, parentId],
  );

  const resolve = useCallback(
    (policy: ConflictPolicy) => {
      if (pending) enqueue(pending.files, parentId, policy);
      setPending(null);
    },
    [enqueue, parentId, pending],
  );

  const prompt = (
    <ConflictPrompt
      open={pending !== null}
      onOpenChange={(open) => !open && setPending(null)}
      names={pending?.clashes ?? []}
      total={pending?.files.length ?? 0}
      onResolve={resolve}
    />
  );

  return { offer, prompt };
}
