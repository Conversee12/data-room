import { HttpException } from '@nestjs/common';
import type { ApiError, ApiErrorCode } from '@data-room/shared';

/**
 * Every failure the API raises on purpose. Carrying a machine-readable `code`
 * lets the UI react precisely — a name conflict opens the rename prompt, a
 * revoked share shows its own screen — without parsing English.
 */
export class AppError extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    status: number,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    const body: ApiError = { statusCode: status, code, message, details };
    super(body, status);
  }

  static validation(message: string, details?: Record<string, string[]>): AppError {
    return new AppError('VALIDATION_FAILED', 400, message, details);
  }

  static unauthenticated(message = 'Sign in to continue.'): AppError {
    return new AppError('UNAUTHENTICATED', 401, message);
  }

  static invalidCredentials(): AppError {
    return new AppError('INVALID_CREDENTIALS', 401, 'That email and password do not match.');
  }

  static emailTaken(): AppError {
    return new AppError('EMAIL_TAKEN', 409, 'An account with that email already exists.');
  }

  static forbidden(message = 'You do not have access to this item.'): AppError {
    return new AppError('FORBIDDEN', 403, message);
  }

  /**
   * Used for genuinely missing items *and* for items the caller may not see, so
   * that probing ids cannot be used to discover what exists.
   */
  static notFound(message = 'That item no longer exists.'): AppError {
    return new AppError('NOT_FOUND', 404, message);
  }

  static nameConflict(name: string): AppError {
    return new AppError('NAME_CONFLICT', 409, `“${name}” already exists in this folder.`);
  }

  static invalidMove(message: string): AppError {
    return new AppError('INVALID_MOVE', 400, message);
  }

  static shareRevoked(): AppError {
    return new AppError('SHARE_REVOKED', 403, 'This link has been turned off by its owner.');
  }

  static shareExpired(): AppError {
    return new AppError('SHARE_EXPIRED', 403, 'This link has expired.');
  }

  static uploadIncomplete(): AppError {
    return new AppError('UPLOAD_INCOMPLETE', 409, 'That upload never finished.');
  }
}
