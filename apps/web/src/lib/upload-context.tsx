'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ACCEPTED_MIME_TYPES,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  type ConflictPolicy,
  type UploadIntent,
} from '@data-room/shared';

import { apiFetch, describeError } from './api';
import { useAuth } from './auth-context';
import { keys } from './queries';

export type UploadState =
  | 'queued'
  | 'uploading'
  | 'finishing'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface UploadItem {
  id: string;
  file: File;
  parentId: string;
  /** Final name, which may differ from the file's when a clash was resolved. */
  name: string;
  state: UploadState;
  /** 0 to 1. Reported by the browser as bytes leave, not guessed. */
  progress: number;
  error?: string;
  versionId?: string;
}

interface UploadValue {
  items: UploadItem[];
  enqueue: (files: File[], parentId: string, onConflict: ConflictPolicy) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  dismiss: (id: string) => void;
  clearFinished: () => void;
  /** Uploads still in flight, for the panel header and the leave warning. */
  activeCount: number;
}

const UploadContext = createContext<UploadValue | null>(null);

/** Uploading everything at once starves each transfer; three keeps it quick. */
const MAX_PARALLEL = 3;

export function UploadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const { token } = useAuth();
  const queryClient = useQueryClient();

  // Kept in refs so the pump can read the latest values without being
  // recreated, which would restart it on every progress tick.
  const requests = useRef(new Map<string, XMLHttpRequest>());
  const policies = useRef(new Map<string, ConflictPolicy>());
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }, []);

  const run = useCallback(
    async (item: UploadItem) => {
      const authToken = tokenRef.current;
      if (!authToken) {
        patch(item.id, { state: 'failed', error: 'Your session expired. Sign in and try again.' });
        return;
      }

      try {
        patch(item.id, { state: 'uploading', progress: 0 });

        const intent = await apiFetch<UploadIntent>('/uploads', {
          method: 'POST',
          token: authToken,
          body: {
            parentId: item.parentId,
            name: item.file.name,
            size: item.file.size,
            mimeType: item.file.type,
            onConflict: policies.current.get(item.id) ?? 'rename',
          },
        });

        // The API may have resolved a clash; show the name it actually used.
        patch(item.id, { name: intent.name, versionId: intent.versionId });

        await putBytes({
          url: intent.uploadUrl,
          file: item.file,
          onProgress: (progress) => patch(item.id, { progress }),
          register: (xhr) => requests.current.set(item.id, xhr),
        });

        patch(item.id, { state: 'finishing', progress: 1 });

        await apiFetch(`/uploads/${intent.versionId}/complete`, {
          method: 'POST',
          token: authToken,
        });

        patch(item.id, { state: 'done' });
        queryClient.invalidateQueries({ queryKey: ['nodes', item.parentId] });
        queryClient.invalidateQueries({ queryKey: keys.dataRooms });
      } catch (error) {
        if (error === CANCELLED) {
          patch(item.id, { state: 'cancelled' });
          return;
        }
        patch(item.id, { state: 'failed', error: describeError(error) });
      } finally {
        requests.current.delete(item.id);
      }
    },
    [patch, queryClient],
  );

  // Starts queued uploads whenever a slot frees up.
  useEffect(() => {
    const running = items.filter(
      (item) => item.state === 'uploading' || item.state === 'finishing',
    ).length;
    const slots = MAX_PARALLEL - running;
    if (slots <= 0) return;

    const next = items.filter((item) => item.state === 'queued').slice(0, slots);
    for (const item of next) {
      patch(item.id, { state: 'uploading' });
      void run(item);
    }
  }, [items, patch, run]);

  const enqueue = useCallback(
    (files: File[], parentId: string, onConflict: ConflictPolicy) => {
      const accepted: UploadItem[] = [];

      for (const file of files) {
        const id = crypto.randomUUID();
        policies.current.set(id, onConflict);

        // Rejected here as well as by the API, so the person sees the reason
        // beside the file instead of waiting for a round trip to fail.
        const problem = validate(file);
        accepted.push({
          id,
          file,
          parentId,
          name: file.name,
          state: problem ? 'failed' : 'queued',
          progress: 0,
          ...(problem ? { error: problem } : {}),
        });
      }

      setItems((current) => [...current, ...accepted]);
    },
    [],
  );

  const cancel = useCallback(
    (id: string) => {
      requests.current.get(id)?.abort();
      const item = items.find((entry) => entry.id === id);
      // Releases the reserved name so a retry can use it again.
      if (item?.versionId && tokenRef.current) {
        void apiFetch(`/uploads/${item.versionId}`, {
          method: 'DELETE',
          token: tokenRef.current,
        }).catch(() => undefined);
      }
      patch(id, { state: 'cancelled' });
    },
    [items, patch],
  );

  const retry = useCallback(
    (id: string) => patch(id, { state: 'queued', progress: 0, error: undefined }),
    [patch],
  );

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setItems((current) =>
      current.filter((item) => item.state !== 'done' && item.state !== 'cancelled'),
    );
  }, []);

  const activeCount = items.filter(
    (item) => item.state === 'queued' || item.state === 'uploading' || item.state === 'finishing',
  ).length;

  // Closing the tab mid-transfer loses the upload; the browser should say so.
  useEffect(() => {
    if (activeCount === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [activeCount]);

  const value = useMemo<UploadValue>(
    () => ({ items, enqueue, cancel, retry, dismiss, clearFinished, activeCount }),
    [items, enqueue, cancel, retry, dismiss, clearFinished, activeCount],
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploads(): UploadValue {
  const value = useContext(UploadContext);
  if (!value) throw new Error('useUploads must be used inside UploadProvider');
  return value;
}

const CANCELLED = Symbol('upload-cancelled');

/**
 * `fetch` cannot report upload progress, so the transfer itself uses XHR. The
 * bytes go straight to storage on a signed URL and never pass through the API.
 */
function putBytes({
  url,
  file,
  onProgress,
  register,
}: {
  url: string;
  file: File;
  onProgress: (progress: number) => void;
  register: (xhr: XMLHttpRequest) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);

    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('x-upsert', 'true');

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage rejected the upload (${xhr.status}).`));
    });
    xhr.addEventListener('error', () =>
      reject(new Error('The connection dropped while uploading.')),
    );
    xhr.addEventListener('abort', () => reject(CANCELLED));

    xhr.send(file);
  });
}

function validate(file: File): string | null {
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_FILE_BYTES) return `Larger than the ${MAX_FILE_LABEL} limit.`;
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Only PDF files can be uploaded.';
  }
  return null;
}
