'use client';

import { Vault } from 'lucide-react';

import { AppHeader } from '@/components/app-header';
import { CreateDataRoomDialog } from '@/components/data-rooms/create-data-room-dialog';
import { DataRoomCard } from '@/components/data-rooms/data-room-card';
import { SharedWithMe } from '@/components/data-rooms/shared-with-me';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { describeError } from '@/lib/api';
import { useDataRooms } from '@/lib/queries';

export default function HomePage() {
  return (
    <RequireAuth>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <DataRoomsSection />
        <SharedWithMe />
      </main>
    </RequireAuth>
  );
}

function DataRoomsSection() {
  const { data, isLoading, isError, error, refetch } = useDataRooms();

  if (isLoading) return <LoadingBlock label="Loading your data rooms" />;

  if (isError) {
    return (
      <ErrorState
        title="Could not load your data rooms"
        description={describeError(error)}
        action={<Button onClick={() => refetch()}>Try again</Button>}
      />
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Data rooms</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Private to you until you share them.
          </p>
        </div>
        {data && data.length > 0 ? <CreateDataRoomDialog /> : null}
      </div>

      {!data || data.length === 0 ? (
        <div className="rounded-card border border-dashed border-border">
          <EmptyState
            icon={Vault}
            title="No data rooms yet"
            description="A data room is the top-level folder that holds everything for one deal."
            action={<CreateDataRoomDialog />}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((room) => (
            <DataRoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </>
  );
}
