import { Module } from '@nestjs/common';

import { AccessService } from '../access/access.service';
import { NodesController } from './nodes.controller';
import { NodesRepository } from './nodes.repository';
import { NodesService } from './nodes.service';

@Module({
  controllers: [NodesController],
  providers: [NodesRepository, NodesService, AccessService],
  exports: [NodesRepository, NodesService, AccessService],
})
export class NodesModule {}
