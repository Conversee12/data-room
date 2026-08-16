'use client';

import { ChevronDown, LogOut, Vault } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { useAuth } from '@/lib/auth-context';

/**
 * The bar every signed-in screen shares. `children` is the slot for whatever the
 * current screen needs beside it, such as the search box inside a data room.
 */
export function AppHeader({ children }: { children?: ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-sm font-semibold text-ink"
        >
          <Vault className="size-5 text-accent" />
          <span className="hidden sm:inline">Data Room</span>
        </Link>

        <div className="min-w-0 flex-1">{children}</div>

        {user ? (
          <Menu>
            <MenuTrigger className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-muted">
              <span
                className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
                aria-hidden
              >
                {initials(user.name)}
              </span>
              <span className="hidden max-w-32 truncate text-ink sm:inline">{user.name}</span>
              <ChevronDown className="size-4 text-ink-faint" />
            </MenuTrigger>
            <MenuContent>
              <div className="px-2.5 py-2">
                <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                <p className="truncate text-xs text-ink-muted">{user.email}</p>
              </div>
              <div className="my-1 h-px bg-border" />
              <MenuItem onSelect={signOut}>
                <LogOut />
                Sign out
              </MenuItem>
            </MenuContent>
          </Menu>
        ) : null}
      </div>
    </header>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
