'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { checkName, describeNameProblem, splitExtension } from '@data-room/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogPanel } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { describeError, isErrorCode } from '@/lib/api';

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  currentName: string;
  /** True for files, so the extension is left out of the initial selection. */
  isFile?: boolean;
  onSubmit: (name: string) => Promise<unknown>;
}

/**
 * Used for folders, files and data rooms alike. On open it preselects just the
 * base name of a file, so replacing the text does not silently drop `.pdf`.
 */
export function RenameDialog({
  open,
  onOpenChange,
  title,
  label,
  currentName,
  isFile,
  onSubmit,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
    }
  }, [open, currentName]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const problem = checkName(name);
    if (problem) {
      setError(describeNameProblem(problem));
      return;
    }
    if (name.trim() === currentName) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      onOpenChange(false);
    } catch (submitError) {
      setError(
        isErrorCode(submitError, 'NAME_CONFLICT')
          ? 'Something with that name is already here. Choose another.'
          : describeError(submitError),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPanel title={title} className="max-w-md">
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field
            label={label}
            value={name}
            error={error ?? undefined}
            autoFocus
            onFocus={(event) => {
              const end = isFile ? splitExtension(event.target.value).base.length : undefined;
              event.target.setSelectionRange(0, end ?? event.target.value.length);
            }}
            onChange={(event) => setName(event.target.value)}
          />

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </DialogPanel>
    </Dialog>
  );
}
