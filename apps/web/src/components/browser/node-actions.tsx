'use client';

import { Download, FolderInput, MoreHorizontal, PencilLine, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { NodeDto } from '@data-room/shared';

import { DeleteDialog } from '@/components/dialogs/delete-dialog';
import { RenameDialog } from '@/components/dialogs/rename-dialog';
import { ShareDialog } from '@/components/sharing/share-dialog';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { describeError } from '@/lib/api';
import { useDeleteNode, useDownloadUrl, useRenameNode, useSubtreeStats } from '@/lib/queries';
import { MoveDialog } from './move-dialog';

interface NodeActionsProps {
  node: NodeDto;
  /** The data room root, where the move picker starts. */
  rootId: string;
  rootName: string;
  /** Called after the node is deleted, so a file screen can navigate away. */
  onDeleted?: () => void;
  className?: string;
}

/**
 * Every write action for one node, together with the dialogs they open. Rows and
 * the file screen share it, so "rename" behaves identically wherever it is used.
 */
export function NodeActions({ node, rootId, rootName, onDeleted, className }: NodeActionsProps) {
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const rename = useRenameNode();
  const remove = useDeleteNode();
  const requestDownload = useDownloadUrl();

  // Only counted once the confirmation is actually open.
  const { data: stats, isLoading: statsLoading } = useSubtreeStats(node.id, deleting);

  const isFolder = node.type === 'FOLDER';

  const download = async () => {
    try {
      window.location.href = await requestDownload(node.id);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" className={className} aria-label={`Actions for ${node.name}`}>
            <MoreHorizontal />
          </Button>
        </MenuTrigger>

        <MenuContent>
          <MenuItem onSelect={() => setSharing(true)}>
            <Share2 />
            Share
          </MenuItem>
          {!isFolder ? (
            <MenuItem onSelect={download}>
              <Download />
              Download
            </MenuItem>
          ) : null}

          <MenuSeparator />

          <MenuItem onSelect={() => setRenaming(true)}>
            <PencilLine />
            Rename
          </MenuItem>
          <MenuItem onSelect={() => setMoving(true)}>
            <FolderInput />
            Move
          </MenuItem>

          <MenuSeparator />

          <MenuItem destructive onSelect={() => setDeleting(true)}>
            <Trash2 />
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={isFolder ? 'Rename folder' : 'Rename file'}
        label="Name"
        currentName={node.name}
        isFile={!isFolder}
        onSubmit={(name) => rename.mutateAsync({ nodeId: node.id, name })}
      />

      {node.parentId ? (
        <MoveDialog
          open={moving}
          onOpenChange={setMoving}
          node={node}
          rootId={rootId}
          rootName={rootName}
          currentParentId={node.parentId}
        />
      ) : null}

      <ShareDialog open={sharing} onOpenChange={setSharing} node={node} />

      <DeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        name={node.name}
        kind={isFolder ? 'folder' : 'file'}
        stats={stats}
        statsLoading={statsLoading}
        onConfirm={async () => {
          await remove.mutateAsync({ nodeId: node.id, parentId: node.parentId });
          toast.success(`“${node.name}” was deleted.`);
          onDeleted?.();
        }}
      />
    </>
  );
}
