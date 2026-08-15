import { Module } from '@nestjs/common';

import { NodesModule } from '../nodes/nodes.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [NodesModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
