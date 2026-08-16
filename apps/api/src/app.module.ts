import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { ApiIndexController } from './api-index.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DataRoomsModule } from './data-rooms/data-rooms.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health.controller';
import { NodesModule } from './nodes/nodes.module';
import { PrismaModule } from './prisma/prisma.module';
import { SharesModule } from './shares/shares.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    StorageModule,
    AuthModule,
    NodesModule,
    DataRoomsModule,
    FilesModule,
    SharesModule,
  ],
  controllers: [ApiIndexController, HealthController],
  // Authentication is opt-out rather than opt-in: forgetting a decorator locks a
  // route down instead of leaving it open.
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
