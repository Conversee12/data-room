import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createDataRoomSchema,
  searchQuerySchema,
  updateDataRoomSchema,
  type CreateDataRoomInput,
  type DataRoomDto,
  type Page,
  type SearchHit,
  type SearchQuery,
  type SharedWithMeItem,
  type SubtreeStats,
  type UpdateDataRoomInput,
} from '@data-room/shared';

import { CurrentUser, Public, ShareToken } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { zodBody, zodQuery } from '../common/zod-validation.pipe';
import { NodesService } from '../nodes/nodes.service';
import { DataRoomsService } from './data-rooms.service';

@Controller('data-rooms')
export class DataRoomsController {
  constructor(
    private readonly dataRooms: DataRoomsService,
    private readonly nodes: NodesService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<DataRoomDto[]> {
    return this.dataRooms.listOwned(user.id);
  }

  // Declared before `:id` so the literal path is not swallowed by the parameter.
  @Get('shared-with-me')
  sharedWithMe(@CurrentUser() user: AuthenticatedUser): Promise<SharedWithMeItem[]> {
    return this.dataRooms.sharedWithMe(user.id);
  }

  @Post()
  create(
    @Body(zodBody(createDataRoomSchema)) body: CreateDataRoomInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DataRoomDto> {
    return this.dataRooms.create(body, user.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<DataRoomDto> {
    return this.dataRooms.get(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateDataRoomSchema)) body: UpdateDataRoomInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DataRoomDto> {
    return this.dataRooms.update(id, body, user.id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ deleted: SubtreeStats }> {
    return this.dataRooms.remove(id, user.id);
  }

  /** Public so that a visitor can search inside a folder shared with them. */
  @Public()
  @Get(':id/search')
  search(
    @Param('id') id: string,
    @Query(zodQuery(searchQuerySchema)) query: SearchQuery,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @ShareToken() shareToken: string | undefined,
  ): Promise<Page<SearchHit>> {
    return this.nodes.search(id, query, { userId: user?.id, shareToken });
  }
}
