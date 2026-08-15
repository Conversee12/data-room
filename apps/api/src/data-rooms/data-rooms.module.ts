import { Module } from '@nestjs/common';

import { NodesModule } from '../nodes/nodes.module';
import { DataRoomsController } from './data-rooms.controller';
import { DataRoomsService } from './data-rooms.service';

@Module({
  imports: [NodesModule],
  controllers: [DataRoomsController],
  providers: [DataRoomsService],
})
export class DataRoomsModule {}
