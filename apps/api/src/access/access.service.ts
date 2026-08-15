import { Injectable } from '@nestjs/common';
import type { AccessInfo } from '@data-room/shared';

import { AppError } from '../common/app-error';
import { NodesRepository, type Db, type NodeRow } from '../nodes/nodes.repository';
import { pathIds } from '../nodes/path';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessContext {
  userId?: string;
  /** Token from the share link the visitor followed, if any. */
  shareToken?: string;
}

export interface CoveringShare {
  id: string;
  nodeId: string;
  mode: 'PUBLIC_LINK' | 'RESTRICTED';
  role: 'VIEWER';
  token: string;
  expiresAt: Date | null;
}

export interface ResolvedAccess {
  node: NodeRow;
  dataRoom: { id: string; name: string; ownerId: string; rootNodeId: string | null };
  access: AccessInfo;
  /** The share that granted access, or null when the caller is the owner. */
  share: CoveringShare | null;
}

/**
 * The single answer to "may this caller see this node, and with what rights".
 *
 * Every read path goes through here, so a share of a data room, a share of a
 * folder and a share of one file are the same rule applied at different depths:
 * a share covers a node when the shared node is that node or one of its
 * ancestors. Ancestors come straight out of the materialized path, so the check
 * is an `IN` on a handful of ids rather than a tree walk.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodes: NodesRepository,
  ) {}

  async resolveNode(nodeId: string, ctx: AccessContext, tx?: Db): Promise<ResolvedAccess> {
    const node = await this.nodes.findById(nodeId, tx);
    if (!node) throw AppError.notFound();
    return this.resolveForNode(node, ctx, tx);
  }

  /** Same rules, for a node already loaded. */
  async resolveForNode(node: NodeRow, ctx: AccessContext, tx?: Db): Promise<ResolvedAccess> {
    const db = tx ?? this.prisma;

    const dataRoom = await db.dataRoom.findUnique({
      where: { id: node.dataRoomId },
      select: { id: true, name: true, ownerId: true, rootNodeId: true },
    });
    if (!dataRoom) throw AppError.notFound();

    if (ctx.userId && dataRoom.ownerId === ctx.userId) {
      return {
        node,
        dataRoom,
        share: null,
        access: {
          role: 'OWNER',
          canWrite: true,
          canShare: true,
          scopeNodeId: dataRoom.rootNodeId ?? node.id,
        },
      };
    }

    const share = await this.findCoveringShare(node, ctx, db);
    if (!share) {
      // Deliberately "not found" rather than "forbidden": someone probing ids
      // should not learn which of them exist.
      throw AppError.notFound();
    }

    return {
      node,
      dataRoom,
      share,
      access: {
        role: 'VIEWER',
        canWrite: false,
        canShare: false,
        scopeNodeId: share.nodeId,
      },
    };
  }

  /** Resolves a data room by id, anchored at its root node. */
  async resolveDataRoom(dataRoomId: string, ctx: AccessContext, tx?: Db): Promise<ResolvedAccess> {
    const db = tx ?? this.prisma;
    const dataRoom = await db.dataRoom.findUnique({
      where: { id: dataRoomId },
      select: { rootNodeId: true },
    });
    if (!dataRoom?.rootNodeId) throw AppError.notFound();
    return this.resolveNode(dataRoom.rootNodeId, ctx, tx);
  }

  /** Resolves and insists the caller may modify the node. */
  async requireWrite(nodeId: string, ctx: AccessContext, tx?: Db): Promise<ResolvedAccess> {
    const resolved = await this.resolveNode(nodeId, ctx, tx);
    if (!resolved.access.canWrite) {
      throw AppError.forbidden('You have read-only access to this item.');
    }
    return resolved;
  }

  /**
   * The live share, if any, that covers `node` for this caller.
   *
   * With a token the visitor may be anonymous; without one, the caller must be
   * signed in and named in a grant.
   */
  private async findCoveringShare(
    node: NodeRow,
    ctx: AccessContext,
    db: Db,
  ): Promise<CoveringShare | null> {
    const coveringNodeIds = pathIds(node.path);
    if (coveringNodeIds.length === 0) return null;

    const live = {
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    if (ctx.shareToken) {
      const share = await db.share.findUnique({
        where: { token: ctx.shareToken },
        select: {
          id: true,
          nodeId: true,
          mode: true,
          role: true,
          token: true,
          expiresAt: true,
          revokedAt: true,
        },
      });

      if (!share || !coveringNodeIds.includes(share.nodeId)) return null;
      // A link that no longer works gets its own message, so the visitor learns
      // it was turned off rather than that the document vanished.
      if (share.revokedAt) throw AppError.shareRevoked();
      if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) throw AppError.shareExpired();

      if (share.mode === 'PUBLIC_LINK') return share;
      if (!ctx.userId) throw AppError.unauthenticated('Sign in to open this shared item.');

      const granted = await this.hasGrant(share.id, ctx.userId, db);
      if (!granted) {
        throw AppError.forbidden('This link is limited to people who were given access.');
      }
      return share;
    }

    if (!ctx.userId) return null;

    // No token: the caller reached the item from "Shared with me".
    const share = await db.share.findFirst({
      where: {
        nodeId: { in: coveringNodeIds },
        ...live,
        grants: { some: { revokedAt: null, userId: ctx.userId } },
      },
      select: { id: true, nodeId: true, mode: true, role: true, token: true, expiresAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return share;
  }

  /**
   * Grants are addressed by email so access can be given before the recipient
   * signs up. The first time that person is seen, the grant is bound to their
   * account, which keeps later lookups a plain indexed match on `userId`.
   */
  private async hasGrant(shareId: string, userId: string, db: Db): Promise<boolean> {
    const direct = await db.shareGrant.findFirst({
      where: { shareId, userId, revokedAt: null },
      select: { id: true },
    });
    if (direct) return true;

    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return false;

    const byEmail = await db.shareGrant.findFirst({
      where: { shareId, email: user.email, userId: null, revokedAt: null },
      select: { id: true },
    });
    if (!byEmail) return false;

    await db.shareGrant.update({ where: { id: byEmail.id }, data: { userId } });
    return true;
  }
}
