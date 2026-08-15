import { Injectable } from '@nestjs/common';
import type {
  CreateDataRoomInput,
  DataRoomDto,
  SharedWithMeItem,
  SubtreeStats,
  UpdateDataRoomInput,
} from '@data-room/shared';

import { AppError } from '../common/app-error';
import { toNodeDto } from '../nodes/nodes.mapper';
import { NodesRepository, nodeSelect } from '../nodes/nodes.repository';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const EMPTY_STATS: SubtreeStats = { fileCount: 0, folderCount: 0, totalSize: 0 };

@Injectable()
export class DataRoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodes: NodesRepository,
    private readonly storage: StorageService,
  ) {}

  async listOwned(userId: string): Promise<DataRoomDto[]> {
    const rooms = await this.prisma.dataRoom.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    const stats = await this.nodes.statsByDataRoom(rooms.map((room) => room.id));
    return rooms.map((room) => toDataRoomDto(room, stats.get(room.id) ?? EMPTY_STATS));
  }

  async get(dataRoomId: string, userId: string): Promise<DataRoomDto> {
    const room = await this.requireOwned(dataRoomId, userId);
    const stats = await this.nodes.statsByDataRoom([room.id]);
    return toDataRoomDto(room, stats.get(room.id) ?? EMPTY_STATS);
  }

  async create(input: CreateDataRoomInput, userId: string): Promise<DataRoomDto> {
    const { id } = await this.prisma.$transaction((tx) =>
      this.nodes.createDataRoomWithRoot(tx, {
        ownerId: userId,
        name: input.name,
        description: input.description ?? null,
      }),
    );

    return this.get(id, userId);
  }

  async update(
    dataRoomId: string,
    input: UpdateDataRoomInput,
    userId: string,
  ): Promise<DataRoomDto> {
    const room = await this.requireOwned(dataRoomId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.dataRoom.update({
        where: { id: room.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      });

      // Keep the root folder's name in step with the data room's, since the
      // breadcrumb shows one and the rooms list shows the other.
      if (input.name !== undefined && room.rootNodeId) {
        const root = await this.nodes.requireById(room.rootNodeId, tx);
        await this.nodes.rename(root, input.name, tx);
      }
    });

    return this.get(room.id, userId);
  }

  /**
   * Removing a data room removes every folder, file and share inside it. Rows go
   * in one cascading delete; blobs are purged afterwards so a storage hiccup
   * cannot leave the tree half-deleted.
   */
  async remove(dataRoomId: string, userId: string): Promise<{ deleted: SubtreeStats }> {
    const room = await this.requireOwned(dataRoomId, userId);
    const stats = (await this.nodes.statsByDataRoom([room.id])).get(room.id) ?? EMPTY_STATS;

    const storageKeys = await this.prisma.$transaction(async (tx) => {
      const versions = await tx.fileVersion.findMany({
        where: { node: { dataRoomId: room.id } },
        select: { storageKey: true },
      });
      await tx.dataRoom.delete({ where: { id: room.id } });
      return versions.map((version) => version.storageKey);
    });

    await this.storage.remove(storageKeys);
    return { deleted: stats };
  }

  /** Items other people shared directly with this user. */
  async sharedWithMe(userId: string): Promise<SharedWithMeItem[]> {
    const shares = await this.prisma.share.findMany({
      where: {
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        grants: { some: { revokedAt: null, userId } },
      },
      select: {
        id: true,
        mode: true,
        role: true,
        token: true,
        expiresAt: true,
        node: { select: nodeSelect },
        dataRoom: { select: { id: true, name: true, rootNodeId: true } },
        createdBy: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return shares.map((share) => ({
      share: {
        id: share.id,
        mode: share.mode,
        role: share.role,
        token: share.token,
        expiresAt: share.expiresAt?.toISOString() ?? null,
        isDataRoomShare: share.dataRoom.rootNodeId === share.node.id,
      },
      node: toNodeDto(share.node, { isShared: true }),
      dataRoom: { id: share.dataRoom.id, name: share.dataRoom.name },
      sharedBy: share.createdBy,
    }));
  }

  private async requireOwned(dataRoomId: string, userId: string) {
    const room = await this.prisma.dataRoom.findUnique({ where: { id: dataRoomId } });
    // Same response for "does not exist" and "not yours", so ids cannot be probed.
    if (!room || room.ownerId !== userId) throw AppError.notFound();
    return room;
  }
}

function toDataRoomDto(
  room: {
    id: string;
    name: string;
    description: string | null;
    ownerId: string;
    rootNodeId: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  stats: SubtreeStats,
): DataRoomDto {
  if (!room.rootNodeId) {
    // Only reachable if a root node was deleted out from under the room, which
    // the API never does; failing loudly beats returning a broken id.
    throw AppError.notFound();
  }

  return {
    id: room.id,
    name: room.name,
    description: room.description,
    rootNodeId: room.rootNodeId,
    ownerId: room.ownerId,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    stats,
  };
}
