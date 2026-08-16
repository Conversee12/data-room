import { z } from 'zod';

import {
  ACCEPTED_MIME_TYPES,
  DEFAULT_PAGE_SIZE,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_PAGE_SIZE,
} from './constants';
import { checkName, describeNameProblem, normalizeName } from './naming';

/**
 * One definition of "a usable folder or file name", used by the API to reject
 * bad input and by the forms to show the same message before a round trip.
 */
export const nameSchema = z
  .string()
  .transform(normalizeName)
  .superRefine((value, ctx) => {
    const problem = checkName(value);
    if (problem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: describeNameProblem(problem) });
    }
  });

export const uuidSchema = z.string().uuid('Expected an id.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.');

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(200, 'That password is too long.');

// --- auth ---------------------------------------------------------------

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, 'Enter your name.').max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// --- data rooms ---------------------------------------------------------

export const createDataRoomSchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(500).optional().nullable(),
});
export type CreateDataRoomInput = z.infer<typeof createDataRoomSchema>;

export const updateDataRoomSchema = createDataRoomSchema.partial();
export type UpdateDataRoomInput = z.infer<typeof updateDataRoomSchema>;

// --- tree ---------------------------------------------------------------

export const createFolderSchema = z.object({
  parentId: uuidSchema,
  name: nameSchema,
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;

export const renameNodeSchema = z.object({ name: nameSchema });
export type RenameNodeInput = z.infer<typeof renameNodeSchema>;

export const moveNodeSchema = z.object({ parentId: uuidSchema });
export type MoveNodeInput = z.infer<typeof moveNodeSchema>;

export const listSortSchema = z.enum(['name', 'updatedAt', 'size']).default('name');
export const listDirectionSchema = z.enum(['asc', 'desc']).default('asc');

export const listChildrenQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: listSortSchema,
  direction: listDirectionSchema,
});
export type ListChildrenQuery = z.infer<typeof listChildrenQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Enter something to search for.').max(200),
  /** Restricts the search to one subtree; defaults to the whole data room. */
  scopeNodeId: uuidSchema.optional(),
  type: z.enum(['ALL', 'FOLDER', 'FILE']).default('ALL'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

// --- uploads ------------------------------------------------------------

/**
 * What to do when the target folder already holds a file with this name.
 * `version` is what the upload UI uses when the user chooses "replace", and it
 * keeps the old bytes retrievable instead of overwriting them.
 */
export const conflictPolicySchema = z.enum(['rename', 'version', 'fail']).default('rename');
export type ConflictPolicy = z.infer<typeof conflictPolicySchema>;

export const uploadIntentSchema = z.object({
  parentId: uuidSchema,
  name: nameSchema,
  size: z
    .number()
    .int()
    .positive('The file is empty.')
    .max(MAX_FILE_BYTES, `That file is larger than the ${MAX_FILE_LABEL} limit.`),
  mimeType: z.enum(ACCEPTED_MIME_TYPES, {
    errorMap: () => ({ message: 'Only PDF files can be uploaded.' }),
  }),
  onConflict: conflictPolicySchema,
});
export type UploadIntentInput = z.infer<typeof uploadIntentSchema>;

// --- sharing ------------------------------------------------------------

export const shareModeSchema = z.enum(['PUBLIC_LINK', 'RESTRICTED']);

export const createShareSchema = z
  .object({
    nodeId: uuidSchema,
    mode: shareModeSchema,
    /** Only meaningful for RESTRICTED shares; ignored otherwise. */
    emails: z.array(emailSchema).max(50).default([]),
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.expiresAt && new Date(value.expiresAt).getTime() <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'Choose a time in the future.',
      });
    }
  });
export type CreateShareInput = z.infer<typeof createShareSchema>;

export const updateShareSchema = z.object({
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export type UpdateShareInput = z.infer<typeof updateShareSchema>;

export const addGrantSchema = z.object({ email: emailSchema });
export type AddGrantInput = z.infer<typeof addGrantSchema>;
