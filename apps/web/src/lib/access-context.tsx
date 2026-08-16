'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * How the current screen is reaching the API: as the signed-in owner, or
 * through a share link.
 *
 * Browsing a data room you own and browsing a folder someone shared with you
 * render the same components; the only difference is that the second sends a
 * share token and hides every control that writes. Putting that difference in
 * one context keeps it out of every component that fetches.
 */
interface AccessValue {
  shareToken: string | null;
  /** Builds the href for a node, staying inside the share when there is one. */
  hrefFor: (nodeId: string) => string;
}

const AccessContext = createContext<AccessValue>({
  shareToken: null,
  hrefFor: (nodeId) => `/n/${nodeId}`,
});

export function AccessProvider({
  shareToken,
  children,
}: {
  shareToken: string | null;
  children: ReactNode;
}) {
  const value = useMemo<AccessValue>(
    () => ({
      shareToken,
      hrefFor: (nodeId: string) => (shareToken ? `/s/${shareToken}/${nodeId}` : `/n/${nodeId}`),
    }),
    [shareToken],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessValue {
  return useContext(AccessContext);
}
