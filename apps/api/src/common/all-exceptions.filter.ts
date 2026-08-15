import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from '@data-room/shared';

import { AppError } from './app-error';

/**
 * Guarantees that every error leaving the API has the same shape, so the client
 * never has to guess between `{ message }`, `{ error }` and a stack trace.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toApiError(exception);

    if (body.statusCode >= 500) {
      this.logger.error(body.message, exception instanceof Error ? exception.stack : undefined);
    }

    response.status(body.statusCode).json(body);
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof AppError) {
      return exception.getResponse() as ApiError;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);

      return {
        statusCode: status,
        code: status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'VALIDATION_FAILED',
        message: Array.isArray(message) ? message.join(' ') : message,
      };
    }

    return {
      statusCode: 500,
      code: 'INTERNAL',
      // Never surface internal detail: the log has it, the caller does not need it.
      message: 'Something went wrong on our side. Please try again.',
    };
  }
}
