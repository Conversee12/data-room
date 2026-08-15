import { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

import { AppError } from './app-error';

/**
 * Validates a body or query against a schema shared with the frontend, and
 * reports failures per field so forms can highlight the offending input.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      (details[key] ??= []).push(issue.message);
    }

    const firstMessage = result.error.issues[0]?.message ?? 'Check the values you entered.';
    throw AppError.validation(firstMessage, details);
  }
}

/** `@Body(zodBody(createFolderSchema))` reads better than constructing the pipe inline. */
export const zodBody = <T>(schema: ZodSchema<T>) => new ZodValidationPipe(schema);
export const zodQuery = <T>(schema: ZodSchema<T>) => new ZodValidationPipe(schema);
