import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  addGrantSchema,
  createShareSchema,
  updateShareSchema,
  type AddGrantInput,
  type CreateShareInput,
  type ShareContext,
  type ShareDto,
  type UpdateShareInput,
} from '@data-room/shared';

import { CurrentUser, Public } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { zodBody } from '../common/zod-validation.pipe';
import { SharesService } from './shares.service';

@Controller()
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  /**
   * Open to visitors without an account: a public link has to resolve for
   * anyone, and a restricted link has to be able to tell a signed-out visitor
   * to sign in.
   */
  @Public()
  @Get('shares/token/:token')
  getByToken(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<ShareContext> {
    return this.shares.getByToken(token, { userId: user?.id });
  }

  @Post('shares')
  create(
    @Body(zodBody(createShareSchema)) body: CreateShareInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShareDto> {
    return this.shares.create(body, user.id);
  }

  @Get('nodes/:id/shares')
  listForNode(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShareDto[]> {
    return this.shares.listForNode(id, user.id);
  }

  @Get('data-rooms/:id/shares')
  listForDataRoom(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShareDto[]> {
    return this.shares.listForDataRoom(id, user.id);
  }

  @Patch('shares/:id')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateShareSchema)) body: UpdateShareInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShareDto> {
    return this.shares.update(id, body, user.id);
  }

  @HttpCode(204)
  @Delete('shares/:id')
  revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.shares.revoke(id, user.id);
  }

  @Post('shares/:id/grants')
  addGrant(
    @Param('id') id: string,
    @Body(zodBody(addGrantSchema)) body: AddGrantInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShareDto> {
    return this.shares.addGrant(id, body, user.id);
  }

  @Delete('shares/:id/grants/:grantId')
  revokeGrant(
    @Param('id') id: string,
    @Param('grantId') grantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShareDto> {
    return this.shares.revokeGrant(id, grantId, user.id);
  }
}
