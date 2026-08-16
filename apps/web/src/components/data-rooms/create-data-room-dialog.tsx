'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { checkName, describeNameProblem } from '@data-room/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogPanel, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { describeError } from '@/lib/api';
import { useCreateDataRoom } from '@/lib/queries';

export function CreateDataRoomDialog({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useCreateDataRoom();
  const router = useRouter();

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const problem = checkName(name);
    if (problem) {
      setError(describeNameProblem(problem));
      return;
    }

    setError(null);
    try {
      const room = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
      });
      setOpen(false);
      setName('');
      setDescription('');
      // Straight into the new room: creating one is always a prelude to filling it.
      router.push(`/n/${room.rootNodeId}`);
    } catch (createError) {
      setError(describeError(createError));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus />
          New data room
        </Button>
      </DialogTrigger>

      <DialogPanel
        title="New data room"
        description="It stays private to you until you share it."
        className="max-w-md"
      >
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field
            label="Name"
            placeholder="Acme acquisition"
            value={name}
            error={error ?? undefined}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <Field
            label="Description"
            placeholder="Optional"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
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
