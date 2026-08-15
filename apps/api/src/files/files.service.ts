import { Injectable, Logger } from '@nestjs/common';
import {
  nextAvailableName,
  toNameKey,
  type FileContentUrl,
  type FileVersionDto,
  type NodeDto,
  type UploadIntent,
  type UploadIntentInput,
} from '@data-room/shared';

import { AccessService, type AccessContext } from '../access/access.service';
import { AppError } from '../common/app-error';
import { toNodeDto } from '../nodes/nodes.mapper';
import { NodesRepository, nodeSelect, type NodeRow } from '../nodes/nodes.repository';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/** How many times to retry an auto-renamed upload that lost a race. */
const RENAME_ATTEMPTS = 5;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly nodes: NodesRepository,
    private readonly storage: StorageService,
  ) {}

  /**
   * Step one of an upload: reserve the name, create a pending version, and hand
   * back a signed URL the browser PUTs the bytes to.
   *
   * Splitting the upload in two means the API never buffers a file, the browser
   * can report real progress, and an abandoned upload leaves a pending row that
   * is invisible in listings rather than a broken document.
   */
  async createUploadIntent(input: UploadIntentInput, ctx: AccessContext): Promise<UploadIntent> {
    const parent = await this.access.requireWrite(input.parentId, ctx);
    if (parent.node.type !== 'FOLDER') {
      throw AppError.validation('Files can only be uploaded into a folder.');
    }

    const userId = ctx.userId!;
    const existing = await this.prisma.node.findFirst({
      where: { parentId: parent.node.id, nameKey: toNameKey(input.name) },
      select: { id: true, type: true, name: true, versionCount: true },
    });

    if (existing?.type === 'FOLDER' && input.onConflict !== 'rename') {
      throw AppError.nameConflict(input.name);
    }

    // "version" only makes sense against an existing file; anything else falls
    // through to the normal new-node path.
    if (existing?.type === 'FILE' && input.onConflict === 'version') {
      return this.intentForNewVersion(parent.node, existing.id, input, userId);
    }
    if (existing && input.onConflict === 'fail') {
      throw AppError.nameConflict(input.name);
    }

    return this.intentForNewFile(parent.node, input, userId);
  }

  /**
   * Step two: confirm the bytes are in storage and publish the version. The size
   * written to the node is the one storage reports, not the one the client
   * claimed, so folder totals cannot be poisoned by a lying client.
   */
  async completeUpload(versionId: string, ctx: AccessContext): Promise<NodeDto> {
    const version = await this.prisma.fileVersion.findUnique({
      where: { id: versionId },
      select: { id: true, nodeId: true, storageKey: true, version: true, status: true },
    });
    if (!version) throw AppError.notFound();

    await this.access.requireWrite(version.nodeId, ctx);

    const actualSize = await this.storage.getObjectSize(version.storageKey);
    if (actualSize === null) {
      throw AppError.uploadIncomplete();
    }

    const node = await this.prisma.$transaction(async (tx) => {
      await tx.fileVersion.update({
        where: { id: version.id },
        data: { status: 'READY', size: BigInt(actualSize) },
      });

      return tx.node.update({
        where: { id: version.nodeId },
        data: {
          currentVersionId: version.id,
          size: BigInt(actualSize),
          versionCount: { increment: 1 },
        },
        select: nodeSelect,
      });
    });

    this.logger.log(`Published version ${version.version} of node ${node.id}`);
    return toNodeDto(node);
  }

  /**
   * Cancelling an upload releases the name straight away. A first version that
   * never completed also takes its placeholder node with it, so a cancelled
   * upload leaves nothing behind.
   */
  async abortUpload(versionId: string, ctx: AccessContext): Promise<void> {
    const version = await this.prisma.fileVersion.findUnique({
      where: { id: versionId },
      select: { id: true, nodeId: true, storageKey: true, status: true },
    });
    if (!version) return;
    if (version.status === 'READY') {
      throw AppError.validation('That upload already finished.');
    }

    await this.access.requireWrite(version.nodeId, ctx);

    await this.prisma.$transaction(async (tx) => {
      await tx.fileVersion.delete({ where: { id: version.id } });
      const node = await tx.node.findUnique({
        where: { id: version.nodeId },
        select: { currentVersionId: true },
      });
      if (node && node.currentVersionId === null) {
        await tx.node.delete({ where: { id: version.nodeId } });
      }
    });

    await this.storage.remove([version.storageKey]);
  }

  /** A short-lived URL for viewing a file inline, or downloading it. */
  async getContentUrl(
    nodeId: string,
    options: { download: boolean; versionId?: string },
    ctx: AccessContext,
  ): Promise<FileContentUrl> {
    const resolved = await this.access.resolveNode(nodeId, ctx);
    if (resolved.node.type !== 'FILE') {
      throw AppError.validation('Only files have contents.');
    }

    const versionId = options.versionId ?? resolved.node.currentVersionId;
    if (!versionId) throw AppError.uploadIncomplete();

    const version = await this.prisma.fileVersion.findFirst({
      where: { id: versionId, nodeId: resolved.node.id, status: 'READY' },
      select: { storageKey: true, mimeType: true, size: true },
    });
    if (!version) throw AppError.notFound();

    const signed = await this.storage.createSignedDownload(version.storageKey, {
      downloadAs: options.download ? resolved.node.name : undefined,
    });

    return {
      url: signed.url,
      expiresAt: signed.expiresAt.toISOString(),
      mimeType: version.mimeType,
      name: resolved.node.name,
      size: Number(version.size),
    };
  }

  async listVersions(nodeId: string, ctx: AccessContext): Promise<FileVersionDto[]> {
    const resolved = await this.access.resolveNode(nodeId, ctx);
    if (resolved.node.type !== 'FILE') {
      throw AppError.validation('Only files have versions.');
    }

    const versions = await this.prisma.fileVersion.findMany({
      where: { nodeId: resolved.node.id, status: 'READY' },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        size: true,
        mimeType: true,
        createdAt: true,
        uploadedBy: { select: { id: true, email: true, name: true } },
      },
    });

    return versions.map((version) => ({
      id: version.id,
      version: version.version,
      size: Number(version.size),
      mimeType: version.mimeType,
      createdAt: version.createdAt.toISOString(),
      uploadedBy: version.uploadedBy,
      isCurrent: version.id === resolved.node.currentVersionId,
    }));
  }

  // --- intent helpers ---------------------------------------------------

  private async intentForNewFile(
    parent: NodeRow,
    input: UploadIntentInput,
    userId: string,
  ): Promise<UploadIntent> {
    let name = input.name;

    for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt += 1) {
      if (input.onConflict === 'rename') {
        name = nextAvailableName(input.name, await this.nodes.takenNameKeys(parent.id));
      }

      try {
        return await this.reserve(parent, name, input, userId, null);
      } catch (error) {
        // Another upload took the name between choosing it and inserting it.
        // Only auto-renaming uploads may retry; the others asked to be told.
        const lostRace = error instanceof AppError && error.code === 'NAME_CONFLICT';
        if (!lostRace || input.onConflict !== 'rename') throw error;
      }
    }

    throw AppError.nameConflict(input.name);
  }

  private async intentForNewVersion(
    parent: NodeRow,
    nodeId: string,
    input: UploadIntentInput,
    userId: string,
  ): Promise<UploadIntent> {
    const node = await this.nodes.requireById(nodeId);
    return this.reserve(parent, node.name, input, userId, node);
  }

  /**
   * Creates (or reuses) the file node and its pending version inside one
   * transaction, then signs the upload URL.
   */
  private async reserve(
    parent: NodeRow,
    name: string,
    input: UploadIntentInput,
    userId: string,
    existingNode: NodeRow | null,
  ): Promise<UploadIntent> {
    const result = await this.prisma.$transaction(async (tx) => {
      const node =
        existingNode ??
        (await this.nodes.createChild(tx, {
          parent,
          type: 'FILE',
          name,
          createdById: userId,
        }));

      const previous = await tx.fileVersion.aggregate({
        where: { nodeId: node.id },
        _max: { version: true },
      });
      const versionNumber = (previous._max.version ?? 0) + 1;
      const versionId = crypto.randomUUID();

      await tx.fileVersion.create({
        data: {
          id: versionId,
          nodeId: node.id,
          version: versionNumber,
          storageKey: this.storage.buildKey({
            dataRoomId: node.dataRoomId,
            nodeId: node.id,
            versionId,
          }),
          size: BigInt(input.size),
          mimeType: input.mimeType,
          status: 'PENDING',
          uploadedById: userId,
        },
      });

      return { node, versionId };
    });

    const storageKey = this.storage.buildKey({
      dataRoomId: result.node.dataRoomId,
      nodeId: result.node.id,
      versionId: result.versionId,
    });
    const signed = await this.storage.createSignedUpload(storageKey);

    return {
      nodeId: result.node.id,
      versionId: result.versionId,
      name: result.node.name,
      uploadUrl: signed.url,
      storageKey: signed.storageKey,
      uploadToken: signed.token,
      replacedVersionOf: existingNode ? existingNode.id : null,
    };
  }
}
