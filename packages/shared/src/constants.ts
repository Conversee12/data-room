/**
 * Characters that break path handling, URLs, or common desktop filesystems.
 * Spaces are deliberately allowed, because real documents have them.
 */
export const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|]/;

export const MAX_NAME_LENGTH = 255;

/** Per-file upload ceiling. Enforced when issuing the signed URL and by storage. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** How many files one drag-and-drop batch may contain. */
export const MAX_UPLOAD_BATCH = 50;

/** Default page size for folder listings. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** Signed storage URLs are short-lived; the UI refetches them on demand. */
export const SIGNED_URL_TTL_SECONDS = 60 * 10;

export const ACCEPTED_MIME_TYPES = ['application/pdf'] as const;

export const ACCEPTED_FILE_EXTENSIONS = ['.pdf'] as const;
