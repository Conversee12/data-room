'use client';

import { FolderPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { checkName, describeNameProblem } from '@data-room/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogPanel, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { describeError, isErrorCode } from '@/lib/api';
import { useCreateFolder } from '@/lib/queries';

export function NewFolderDialog({ parentId }: { parentId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useCreateFolder(parentId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const problem = checkName(name);
    if (problem) {
      setError(describeNameProblem(problem));
      return;
    }

    setError(null);
    try {
      await create.mutateAsync(name.trim());
      setOpen(false);
      setName('');
    } catch (createError) {
      setError(
        isErrorCode(createError, 'NAME_CONFLICT')
          ? 'A folder with that name is already here.'
          : describeError(createError),
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName('');
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">
          <FolderPlus />
          <span className="hidden sm:inline">New folder</span>
        </Button>
      </DialogTrigger>

      <DialogPanel title="New folder" className="max-w-md">
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field
            label="Folder name"
            placeholder="Financials"
            value={name}
            error={error ?? undefined}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Create
            </Button>
          </div>
        </form>
      </DialogPanel>
    </Dialog>
  );
}
