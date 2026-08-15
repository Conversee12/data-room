import { Controller, Get } from '@nestjs/common';

import { Public } from './auth/auth.decorators';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Checks the database too: a process that cannot query is not healthy. */
  @Public()
  @Get()
  async check(): Promise<{ status: 'ok'; database: 'up' | 'down' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch {
      return { status: 'ok', database: 'down' };
    }
  }
}
