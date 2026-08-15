import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from './auth.types';

export const IS_PUBLIC_KEY = 'auth:public';

/**
 * Marks a route as reachable without a session. It does *not* mean unguarded:
 * node routes are public so that share links work, and the access resolver
 * still decides what an anonymous visitor may read.
 */
export const Public = (): MethodDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** The signed-in user, or undefined on a public route. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<Request>().user,
);

/**
 * The share link the visitor arrived through, read from a header rather than
 * the query string so it never lands in server logs or in the Referer of an
 * embedded PDF.
 */
export const ShareToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-share-token'];
    const value = Array.isArray(header) ? header[0] : header;
    return value?.trim() || undefined;
  },
);
