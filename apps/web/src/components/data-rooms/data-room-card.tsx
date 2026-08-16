'use client';

import { FolderOpen, MoreHorizontal, PencilLine, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatBytes, pluralize, type DataRoomDto } from '@data-room/shared';

import { DeleteDialog } from '@/components/dialogs/delete-dialog';
import { RenameDialog } from '@/components/dialogs/rename-dialog';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useDeleteDataRoom, useUpdateDataRoom } from '@/lib/queries';

export function DataRoomCard({ room }: { room: DataRoomDto }) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const update = useUpdateDataRoom(room.id);
  const remove = useDeleteDataRoom();

  return (
    <>
      <div className="group relative rounded-card border border-border bg-surface p-5 transition-colors hover:border-border-strong">
        {/* The whole card is the link; the menu sits above it in stacking order. */}
        <Link href={`/n/${room.rootNodeId}`} className="absolute inset-0 rounded-card" >
          <span className="sr-only">Open {room.name}</span>
        </Link>

        <div className="flex items-start justify-between gap-3">
          <div className="rounded-lg bg-accent-soft p-2.5">
            <FolderOpen className="size-5 text-accent" />
          </div>

          <Menu>
            <MenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                aria-label={`Actions for ${room.name}`}
              >
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => setRenaming(true)}>
                <PencilLine />
                Rename
              </MenuItem>
              <MenuSeparator />
              <MenuItem destructive onSelect={() => setDeleting(true)}>
                <Trash2 />
                Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>

        <h3 className="mt-4 truncate font-medium text-ink">{room.name}</h3>
        {room.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{room.description}</p>
        ) : null}

        <p className="mt-3 text-sm text-ink-faint">
          {room.stats.fileCount === 0 && room.stats.folderCount === 0
            ? 'Empty'
            : `${pluralize(room.stats.fileCount, 'file')} · ${formatBytes(room.stats.totalSize)}`}
        </p>
      </div>

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename data room"
        label="Name"
        currentName={room.name}
        onSubmit={(name) => update.mutateAsync({ name })}
      />

      <DeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        name={room.name}
        kind="data room"
        stats={room.stats}
        statsLoading={false}
        onConfirm={() => remove.mutateAsync(room.id)}
      />
    </>
  );
}
