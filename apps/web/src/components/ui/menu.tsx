'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export const MenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(function MenuContent({ className, align = 'end', sideOffset = 6, ...props }, ref) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'animate-panel z-50 min-w-44 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-lg',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
});

export const MenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { destructive?: boolean }
>(function MenuItem({ className, destructive, ...props }, ref) {
  return (
    <DropdownMenu.Item
      ref={ref}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors',
        '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-faint',
        destructive
          ? 'text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger'
          : 'text-ink data-[highlighted]:bg-surface-muted',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
});

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border" />;
}
