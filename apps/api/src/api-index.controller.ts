import { Controller, Get } from '@nestjs/common';

import { Public } from './auth/auth.decorators';

interface ApiIndex {
  name: string;
  description: string;
  status: 'ok';
  web: string;
  repository: string;
  health: string;
  endpoints: Record<string, string[]>;
}

/**
 * What the bare API host answers with.
 *
 * Every real route lives under `/api`, so without this the root is a blank 404 —
 * which reads as a broken deployment to anyone who opens the backend URL in a
 * browser rather than calling it from code. This says what the service is,
 * confirms it is running, and lists what it exposes.
 */
@Controller()
export class ApiIndexController {
  @Public()
  @Get()
  root(): ApiIndex {
    return index();
  }

  @Public()
  @Get('api')
  api(): ApiIndex {
    return index();
  }
}

function index(): ApiIndex {
  return {
    name: 'Data Room API',
    description:
      'Folders, PDF uploads and read-only sharing for a virtual data room. ' +
      'Authenticate with POST /api/auth/register or /api/auth/login, then send ' +
      'the returned token as `Authorization: Bearer <token>`. Requests arriving ' +
      'through a share link send it as `X-Share-Token` instead.',
    status: 'ok',
    web: 'https://data-room-iota-one.vercel.app',
    repository: 'https://github.com/Conversee12/data-room',
    health: '/api/health',
    endpoints: {
      auth: ['POST /api/auth/register', 'POST /api/auth/login', 'GET /api/auth/me'],
      dataRooms: [
        'GET /api/data-rooms',
        'POST /api/data-rooms',
        'GET /api/data-rooms/shared-with-me',
        'GET /api/data-rooms/:id',
        'PATCH /api/data-rooms/:id',
        'DELETE /api/data-rooms/:id',
        'GET /api/data-rooms/:id/search?q=',
      ],
      tree: [
        'GET /api/nodes/:id',
        'GET /api/nodes/:id/children',
        'GET /api/nodes/:id/stats',
        'POST /api/folders',
        'PATCH /api/nodes/:id',
        'POST /api/nodes/:id/move',
        'DELETE /api/nodes/:id',
      ],
      files: [
        'POST /api/uploads',
        'POST /api/uploads/:versionId/complete',
        'DELETE /api/uploads/:versionId',
        'GET /api/nodes/:id/content',
        'GET /api/nodes/:id/versions',
      ],
      sharing: [
        'POST /api/shares',
        'GET /api/shares/token/:token',
        'GET /api/nodes/:id/shares',
        'PATCH /api/shares/:id',
        'DELETE /api/shares/:id',
        'POST /api/shares/:id/grants',
        'DELETE /api/shares/:id/grants/:grantId',
      ],
    },
  };
}
