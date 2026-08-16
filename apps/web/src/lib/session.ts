const STORAGE_KEY = 'data-room.token';

/**
 * The bearer token lives in localStorage because the API is on a different
 * origin from the app, where a cookie would have to be third-party and is
 * blocked by default in several browsers. The trade-off — a token readable by
 * script — is noted in the README along with the same-origin alternative.
 */
export const session = {
  read(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing modes can refuse storage entirely.
      return null;
    }
  },

  write(token: string): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, token);
    } catch {
      /* Sign-in still works for this tab; it just will not be remembered. */
    }
  },

  clear(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Nothing to clean up. */
    }
  },
};
