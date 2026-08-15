import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@data-room/db';
import type {
  AddGrantInput,
  CreateShareInput,
  ShareContext,
  ShareDto,
  ShareGrantDto,
  UpdateShareInput,
} from '@data-room/shared';

import { AccessService, type AccessContext } from '../access/access.service';
import { AppError } from '../common/app-error';
import { toNodeDto } from '../nodes/nodes.mapper';
import { PrismaService } from '../prisma/prisma.service';

const shareSelect = Prisma.validator<Prisma.ShareSelect>()({
  id: true,
  dataRoomId: true,
  nodeId: true,
  mode: true,
  role: true,
  token: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  node: { select: { id: true, name: true, type: true } },
  dataRoom: { select: { rootNodeId: true } },
  grants: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      email: true,
      role: true,
      revokedAt: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  },
});

@Injectable()
export class SharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /**
   * Sharing a data room, a folder or a single file is the same operation: the
   * share points at a node, and the access resolver treats everything beneath
   * that node as included.
   *
   * Re-sharing the same node in the same mode returns the existing link rather
   * than minting a second one, so "Copy link" twice does not create two links
   * the owner then has to revoke separately.
   */
  async create(input: CreateShareInput, userId: string): Promise<ShareDto> {
    const resolved = await this.access.requireWrite(input.nodeId, { userId });

    const existing = await this.prisma.share.findFirst({
      where: { nodeId: resolved.node.id, mode: input.mode, revokedAt: null },
      select: shareSelect,
    });

    const share =
      existing ??
      (await this.prisma.share.create({
        data: {
          dataRoomId: resolved.node.dataRoomId,
          nodeId: resolved.node.id,
          mode: input.mode,
          token: generateToken(),
          createdById: userId,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
        select: shareSelect,
      }));

    if (input.mode === 'RESTRICTED' && input.emails.length > 0) {
      await this.addGrants(share.id, input.emails);
    }

    if (existing && input.expiresAt !== undefined) {
      await this.prisma.share.update({
        where: { id: share.id },
        data: { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
      });
    }

    return this.requireDto(share.id);
  }

  async listForNode(nodeId: string, userId: string): Promise<ShareDto[]> {
    await this.access.requireWrite(nodeId, { userId });

    const shares = await this.prisma.share.findMany({
      where: { nodeId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
      select: shareSelect,
    });

    return shares.map(toShareDto);
  }

  /** Every live share inside a data room, for the owner's sharing overview. */
  async listForDataRoom(dataRoomId: string, userId: string): Promise<ShareDto[]> {
    const room = await this.prisma.dataRoom.findUnique({
      where: { id: dataRoomId },
      select: { ownerId: true },
    });
    if (!room || room.ownerId !== userId) throw AppError.notFound();

    const shares = await this.prisma.share.findMany({
      where: { dataRoomId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: shareSelect,
    });

    return shares.map(toShareDto);
  }

  async update(shareId: string, input: UpdateShareInput, userId: string): Promise<ShareDto> {
    const share = await this.requireOwned(shareId, userId);

    await this.prisma.share.update({
      where: { id: share.id },
      data: {
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
          : {}),
      },
    });

    return this.requireDto(share.id);
  }

  /**
   * Revoking is a timestamp, not a delete: anyone who follows the link
   * afterwards is told it was turned off, which is more useful than a 404, and
   * the owner keeps a record that the link once existed.
   */
  async revoke(shareId: string, userId: string): Promise<void> {
    const share = await this.requireOwned(shareId, userId);
    await this.prisma.share.update({
      where: { id: share.id },
      data: { revokedAt: new Date() },
    });
  }

  async addGrant(shareId: string, input: AddGrantInput, userId: string): Promise<ShareDto> {
    const share = await this.requireOwned(shareId, userId);
    if (share.mode !== 'RESTRICTED') {
      throw AppError.validation('Only a restricted share has a list of people.');
    }

    await this.addGrants(share.id, [input.email]);
    return this.requireDto(share.id);
  }

  async revokeGrant(shareId: string, grantId: string, userId: string): Promise<ShareDto> {
    const share = await this.requireOwned(shareId, userId);
    const grant = await this.prisma.shareGrant.findFirst({
      where: { id: grantId, shareId: share.id },
      select: { id: true },
    });
    if (!grant) throw AppError.notFound();

    await this.prisma.shareGrant.delete({ where: { id: grant.id } });
    return this.requireDto(share.id);
  }

  /**
   * What a visitor arriving at a share link is allowed to see. Access is decided
   * by the same resolver used for every other read, so a revoked, expired or
   * ungranted link fails here exactly as it would deeper in the tree.
   */
  async getByToken(token: string, ctx: AccessContext): Promise<ShareContext> {
    const share = await this.prisma.share.findUnique({
      where: { token },
      select: {
        id: true,
        mode: true,
        role: true,
        token: true,
        expiresAt: true,
        nodeId: true,
        dataRoom: { select: { id: true, name: true, rootNodeId: true } },
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });
    if (!share) throw AppError.notFound('That link does not exist.');

    const resolved = await this.access.resolveNode(share.nodeId, { ...ctx, shareToken: token });

    return {
      share: {
        id: share.id,
        mode: share.mode,
        role: share.role,
        token: share.token,
        expiresAt: share.expiresAt?.toISOString() ?? null,
        isDataRoomShare: share.dataRoom.rootNodeId === share.nodeId,
      },
      node: toNodeDto(resolved.node, { isShared: true }),
      dataRoom: { id: share.dataRoom.id, name: share.dataRoom.name },
      sharedBy: share.createdBy,
    };
  }

  // --- helpers ----------------------------------------------------------

  /**
   * Grants are keyed by email so someone can be invited before they have an
   * account. Re-inviting an address reactivates the existing row instead of
   * failing on the unique constraint.
   */
  private async addGrants(shareId: string, emails: string[]): Promise<void> {
    const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()))].filter(Boolean);
    if (unique.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { email: { in: unique } },
      select: { id: true, email: true },
    });
    const userByEmail = new Map(users.map((user) => [user.email, user.id]));

    await this.prisma.$transaction(
      unique.map((email) =>
        this.prisma.shareGrant.upsert({
          where: { shareId_email: { shareId, email } },
          create: { shareId, email, userId: userByEmail.get(email) ?? null },
          update: { revokedAt: null, userId: userByEmail.get(email) ?? null },
        }),
      ),
    );
  }

  private async requireOwned(shareId: string, userId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      select: { id: true, mode: true, nodeId: true, dataRoom: { select: { ownerId: true } } },
    });
    if (!share || share.dataRoom.ownerId !== userId) throw AppError.notFound();
    return share;
  }

  private async requireDto(shareId: string): Promise<ShareDto> {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      select: shareSelect,
    });
    if (!share) throw AppError.notFound();
    return toShareDto(share);
  }
}

type ShareRecord = Prisma.ShareGetPayload<{ select: typeof shareSelect }>;

function toShareDto(share: ShareRecord): ShareDto {
  return {
    id: share.id,
    nodeId: share.nodeId,
    nodeName: share.node.name,
    nodeType: share.node.type,
    isDataRoomShare: share.dataRoom.rootNodeId === share.nodeId,
    mode: share.mode,
    role: share.role,
    token: share.token,
    expiresAt: share.expiresAt?.toISOString() ?? null,
    revokedAt: share.revokedAt?.toISOString() ?? null,
    createdAt: share.createdAt.toISOString(),
    grants: share.grants.map(toGrantDto),
  };
}

function toGrantDto(grant: ShareRecord['grants'][number]): ShareGrantDto {
  return {
    id: grant.id,
    email: grant.email,
    role: grant.role,
    user: grant.user,
    revokedAt: grant.revokedAt?.toISOString() ?? null,
    createdAt: grant.createdAt.toISOString(),
  };
}

/** 32 characters of URL-safe randomness: not guessable, still easy to paste. */
function generateToken(): string {
  return randomBytes(24).toString('base64url');
}
