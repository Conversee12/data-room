import { ILLEGAL_NAME_CHARS, MAX_NAME_LENGTH } from './constants';

/** Collapses whitespace and trims, so " Report .pdf" and "Report .pdf" agree. */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/**
 * The value uniqueness is enforced on. Case-insensitive, because a data room
 * containing both `Contract.pdf` and `contract.pdf` is a mistake, not a feature.
 */
export function toNameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

export type NameProblem =
  | 'empty'
  | 'too-long'
  | 'illegal-characters'
  | 'reserved';

/** Returns null when the name is usable, otherwise why it is not. */
export function checkName(rawName: string): NameProblem | null {
  const name = normalizeName(rawName);
  if (name.length === 0) return 'empty';
  if (name.length > MAX_NAME_LENGTH) return 'too-long';
  if (ILLEGAL_NAME_CHARS.test(name)) return 'illegal-characters';
  if (name === '.' || name === '..') return 'reserved';
  return null;
}

export function describeNameProblem(problem: NameProblem): string {
  switch (problem) {
    case 'empty':
      return 'Name cannot be empty.';
    case 'too-long':
      return `Name cannot be longer than ${MAX_NAME_LENGTH} characters.`;
    case 'illegal-characters':
      return 'Name cannot contain \\ / : * ? " < > or |.';
    case 'reserved':
      return 'That name is reserved.';
  }
}

/** Splits `Q3 report.pdf` into `{ base: 'Q3 report', ext: '.pdf' }`. */
export function splitExtension(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

/**
 * Desktop-style conflict resolution: `report.pdf` becomes `report (1).pdf`.
 * `taken` holds name keys, not display names.
 */
export function nextAvailableName(name: string, taken: Iterable<string>): string {
  const takenKeys = new Set<string>();
  for (const value of taken) takenKeys.add(value);

  const normalized = normalizeName(name);
  if (!takenKeys.has(toNameKey(normalized))) return normalized;

  const { base, ext } = splitExtension(normalized);
  // Strip an existing " (n)" so re-uploading `report (1).pdf` yields
  // `report (2).pdf` rather than `report (1) (1).pdf`.
  const stem = base.replace(/ \((\d+)\)$/, '');

  for (let counter = 1; counter < 10_000; counter += 1) {
    const candidate = `${stem} (${counter})${ext}`;
    if (!takenKeys.has(toNameKey(candidate))) return candidate;
  }
  return `${stem} (${Date.now()})${ext}`;
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)} ${SIZE_UNITS[exponent]}`;
}

/** "3 files" / "1 file" without pulling in an i18n dependency. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}
