import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  uploadIntentSchema,
  type FileContentUrl,
  type FileVersionDto,
  type NodeDto,
  type UploadIntent,
  type UploadIntentInput,
} from '@data-room/shared';

import { CurrentUser, Public, ShareToken } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { zodBody } from '../common/zod-validation.pipe';
import { FilesService } from './files.service';

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('uploads')
  createIntent(
    @Body(zodBody(uploadIntentSchema)) body: UploadIntentInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UploadIntent> {
    return this.files.createUploadIntent(body, { userId: user.id });
  }

  @HttpCode(200)
  @Post('uploads/:versionId/complete')
  complete(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NodeDto> {
    return this.files.completeUpload(versionId, { userId: user.id });
  }

  @HttpCode(204)
  @Delete('uploads/:versionId')
  abort(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.files.abortUpload(versionId, { userId: user.id });
  }

  /**
   * Returns a signed URL rather than the bytes: the browser fetches straight
   * from storage, so viewing a 50 MB document never occupies an API process.
   */
  @Public()
  @Get('nodes/:id/content')
  content(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Query('versionId') versionId: string | undefined,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @ShareToken() shareToken: string | undefined,
  ): Promise<FileContentUrl> {
    return this.files.getContentUrl(
      id,
      { download: download === '1' || download === 'true', versionId },
      { userId: user?.id, shareToken },
    );
  }

  @Public()
  @Get('nodes/:id/versions')
  versions(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @ShareToken() shareToken: string | undefined,
  ): Promise<FileVersionDto[]> {
    return this.files.listVersions(id, { userId: user?.id, shareToken });
  }
}
