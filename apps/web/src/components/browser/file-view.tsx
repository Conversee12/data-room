'use client';

import { Download, FileText, History, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatBytes, type NodeDetail } from '@data-room/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingBlock } from '@/components/ui/states';
import { describeError } from '@/lib/api';
import { useAccess } from '@/lib/access-context';
import { useDownloadUrl, useFileContent, useFileVersions } from '@/lib/queries';
import { Breadcrumbs } from './breadcrumbs';
import { NodeActions } from './node-actions';

interface FileViewProps {
  detail: NodeDetail;
  rootId: string;
  rootName: string;
  onShare: () => void;
}

export function FileView({ detail, rootId, rootName, onShare }: FileViewProps) {
  const { node, breadcrumbs, access } = detail;
  const router = useRouter();
  const { hrefFor } = useAccess();

  const [versionId, setVersionId] = useState<string | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const content = useFileContent(node.id, versionId);
  const versions = useFileVersions(node.id, historyOpen);
  const requestDownload = useDownloadUrl();

  const hasHistory = (node.versionCount ?? 0) > 1;

  const download = async () => {
    setDownloading(true);
    try {
      const url = await requestDownload(node.id, versionId);
      window.location.href = url;
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs crumbs={breadcrumbs} />

        <div className="flex shrink-0 items-center gap-2">
          {hasHistory ? (
            <Button variant="ghost" onClick={() => setHistoryOpen((open) => !open)}>
              <History />
              <span className="hidden sm:inline">
                {historyOpen ? 'Hide history' : `History (${node.versionCount})`}
              </span>
            </Button>
          ) : null}

          {/* Storage is a different origin, where the `download` attribute is
              ignored, so downloading asks for its own signed URL carrying a
              content-disposition instead of reusing the viewer's. */}
          <Button variant="secondary" loading={downloading} onClick={download}>
            <Download />
            <span className="hidden sm:inline">Download</span>
          </Button>

          {access.canWrite ? (
            <>
              <Button variant="ghost" onClick={onShare}>
                <Share2 />
                <span className="hidden sm:inline">Share</span>
              </Button>
              <NodeActions
                node={node}
                rootId={rootId}
                rootName={rootName}
                onDeleted={() => router.replace(node.parentId ? hrefFor(node.parentId) : '/')}
              />
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 overflow-hidden rounded-card border border-border bg-surface">
          {content.isLoading ? (
            <LoadingBlock label="Opening document" />
          ) : content.isError ? (
            <ErrorState
              title="Could not open this document"
              description={describeError(content.error)}
              action={<Button onClick={() => content.refetch()}>Try again</Button>}
            />
          ) : content.data ? (
            <>
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
                <FileText className="size-4 shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {node.name}
                </span>
                {versionId ? (
                  <Badge tone="warning">Older version</Badge>
                ) : null}
                <span className="shrink-0 text-sm text-ink-faint">
                  {formatBytes(content.data.size)}
                </span>
              </div>

              {/* Browsers render PDFs natively, so no viewer library is shipped
                  to the client. The bytes come straight from storage. */}
              <iframe
                key={content.data.url}
                src={content.data.url}
                title={node.name}
                className="h-[70vh] w-full border-0 bg-surface-muted"
              />
            </>
          ) : null}
        </div>

        {historyOpen ? (
          <aside className="w-full shrink-0 overflow-hidden rounded-card border border-border bg-surface lg:w-72">
            <h2 className="border-b border-border px-4 py-2.5 text-sm font-medium text-ink">
              Version history
            </h2>

            {versions.isLoading ? (
              <LoadingBlock label="Loading versions" />
            ) : (
              <ul className="divide-y divide-border">
                {versions.data?.map((version) => {
                  const selected = version.isCurrent ? !versionId : versionId === version.id;
                  return (
                    <li key={version.id}>
                      <button
                        type="button"
                        onClick={() => setVersionId(version.isCurrent ? undefined : version.id)}
                        className={`w-full px-4 py-3 text-left transition-colors hover:bg-surface-muted ${
                          selected ? 'bg-accent-soft/60' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink">
                            Version {version.version}
                          </span>
                          {version.isCurrent ? <Badge tone="accent">Current</Badge> : null}
                        </div>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {formatBytes(version.size)} · {version.uploadedBy.name}
                        </p>
                        <p className="text-xs text-ink-faint">
                          {new Date(version.createdAt).toLocaleString()}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
