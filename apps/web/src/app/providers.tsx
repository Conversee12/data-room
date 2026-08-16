'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';

import { AuthProvider } from '@/lib/auth-context';
import { UploadProvider } from '@/lib/upload-context';

export function Providers({ children }: { children: ReactNode }) {
  // Created once per browser session rather than per render, so navigating does
  // not throw away the cache.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UploadProvider>{children}</UploadProvider>
      </AuthProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: 'rounded-lg border border-border bg-surface text-ink shadow-lg',
          },
        }}
      />
    </QueryClientProvider>
  );
}
