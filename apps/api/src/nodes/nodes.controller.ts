import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createFolderSchema,
  listChildrenQuerySchema,
  moveNodeSchema,
  renameNodeSchema,
  type CreateFolderInput,
  type ListChildrenQuery,
  type MoveNodeInput,
  type NodeDetail,
  type NodeDto,
  type Page,
  type RenameNodeInput,
  type SubtreeStats,
} from '@data-room/shared';

import { CurrentUser, Public, ShareToken } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { zodBody, zodQuery } from '../common/zod-validation.pipe';
import { NodesService } from './nodes.service';

/**
 * Read routes are `@Public` because a share link must work without an account;
 * the access resolver, not the guard, decides what an anonymous visitor sees.
 * Write routes stay guarded so a signed-out user gets "sign in" rather than
 * "not found".
 */
@Controller()
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Public()
  @Get('nodes/:id')
  getNode(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @ShareToken() shareToken: string | undefined,
  ): Promise<NodeDetail> {
    return this.nodes.getDetail(id, { userId: user?.id, shareToken });
  }

  @Public()
  @Get('nodes/:id/children')
  listChildren(
    @Param('id') id: string,
    @Query(zodQuery(listChildrenQuerySchema)) query: ListChildrenQuery,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @ShareToken() shareToken: string | undefined,
  ): Promise<Page<NodeDto>> {
    return this.nodes.listChildren(id, query, { userId: user?.id, shareToken });
  }

  @Public()
  @Get('nodes/:id/stats')
  getStats(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @ShareToken() shareToken: string | undefined,
  ): Promise<SubtreeStats> {
    return this.nodes.getStats(id, { userId: user?.id, shareToken });
  }

  @Post('folders')
  createFolder(
    @Body(zodBody(createFolderSchema)) body: CreateFolderInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NodeDto> {
    return this.nodes.createFolder(body, { userId: user.id });
  }

  @Patch('nodes/:id')
  rename(
    @Param('id') id: string,
    @Body(zodBody(renameNodeSchema)) body: RenameNodeInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NodeDto> {
    return this.nodes.rename(id, body.name, { userId: user.id });
  }

  @Post('nodes/:id/move')
  move(
    @Param('id') id: string,
    @Body(zodBody(moveNodeSchema)) body: MoveNodeInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NodeDto> {
    return this.nodes.move(id, body.parentId, { userId: user.id });
  }

  @Delete('nodes/:id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ deleted: SubtreeStats }> {
    return this.nodes.remove(id, { userId: user.id });
  }
}
