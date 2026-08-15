import { Module } from '@nestjs/common';

import { NodesModule } from '../nodes/nodes.module';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';

@Module({
  imports: [NodesModule],
  controllers: [SharesController],
  providers: [SharesService],
})
export class SharesModule {}
