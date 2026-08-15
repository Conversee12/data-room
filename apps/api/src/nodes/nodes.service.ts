import { Injectable } from '@nestjs/common';
import type {
  BreadcrumbDto,
  CreateFolderInput,
  ListChildrenQuery,
  NodeDetail,
  NodeDto,
  Page,
  SearchHit,
  SearchQuery,
  SubtreeStats,
} from '@data-room/shared';

import { AccessService, type AccessContext } from '../access/access.service';
import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { toBreadcrumb, toNodeDto, toNodeDtos } from './nodes.mapper';
import { NodesRepository, type NodeRow } from './nodes.repository';
import { isDescendantOrSelf, pathIds } from './path';

@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly nodes: NodesRepository,
    private readonly storage: StorageService,
  ) {}

  async getDetail(nodeId: string, ctx: AccessContext): Promise<NodeDetail> {
    const resolved = await this.access.resolveNode(nodeId, ctx);
    const [breadcrumbs, sharedNodeIds] = await Promise.all([
      this.breadcrumbs(resolved.node, resolved.access.scopeNodeId),
      this.liveShareNodeIds([resolved.node.id]),
    ]);

    return {
      node: toNodeDto(resolved.node, { isShared: sharedNodeIds.has(resolved.node.id) }),
      breadcrumbs,
      dataRoom: { id: resolved.dataRoom.id, name: resolved.dataRoom.name },
      access: resolved.access,
    };
  }

  async listChildren(
    nodeId: string,
    query: ListChildrenQuery,
    ctx: AccessContext,
  ): Promise<Page<NodeDto>> {
    const resolved = await this.access.resolveNode(nodeId, ctx);
    if (resolved.node.type !== 'FOLDER') {
      throw AppError.validation('Only folders have contents.');
    }

    const page = await this.nodes.listChildren(nodeId, query);
    const sharedNodeIds = await this.liveShareNodeIds(page.items.map((item) => item.id));

    return { items: toNodeDtos(page.items, sharedNodeIds), nextCursor: page.nextCursor };
  }

  /**
   * Used by the delete confirmation, which has to tell the user exactly what is
   * about to disappear before they agree to it.
   */
  async getStats(nodeId: string, ctx: AccessContext): Promise<SubtreeStats> {
    const resolved = await this.access.resolveNode(nodeId, ctx);
    if (resolved.node.type === 'FILE') {
      return { fileCount: 1, folderCount: 0, totalSize: Number(resolved.node.size) };
    }
    return this.nodes.subtreeStats(resolved.node);
  }

  async createFolder(input: CreateFolderInput, ctx: AccessContext): Promise<NodeDto> {
    const parent = await this.access.requireWrite(input.parentId, ctx);
    if (parent.node.type !== 'FOLDER') {
      throw AppError.validation('Folders can only be created inside another folder.');
    }

    const created = await this.nodes.createChild(this.prisma, {
      parent: parent.node,
      type: 'FOLDER',
      name: input.name,
      createdById: ctx.userId!,
    });

    return toNodeDto(created);
  }

  async rename(nodeId: string, name: string, ctx: AccessContext): Promise<NodeDto> {
    const resolved = await this.access.requireWrite(nodeId, ctx);

    const renamed = await this.prisma.$transaction(async (tx) => {
      const node = await this.nodes.rename(resolved.node, name, tx);
      // The root folder *is* the data room, so renaming one renames the other
      // instead of letting the two drift apart in the UI.
      if (node.parentId === null) {
        await tx.dataRoom.update({ where: { id: node.dataRoomId }, data: { name } });
      }
      return node;
    });

    return toNodeDto(renamed);
  }

  async move(nodeId: string, targetParentId: string, ctx: AccessContext): Promise<NodeDto> {
    const resolved = await this.access.requireWrite(nodeId, ctx);
    const node = resolved.node;

    if (node.parentId === null) {
      throw AppError.invalidMove('A data room cannot be moved into itself.');
    }
    if (targetParentId === node.parentId) {
      return toNodeDto(node);
    }

    const target = await this.access.requireWrite(targetParentId, ctx);
    if (target.node.type !== 'FOLDER') {
      throw AppError.invalidMove('Items can only be moved into a folder.');
    }
    if (target.node.dataRoomId !== node.dataRoomId) {
      throw AppError.invalidMove('Items cannot be moved between data rooms.');
    }
    // Moving a folder inside itself would detach the subtree from the root.
    if (isDescendantOrSelf(target.node.path, node.path)) {
      throw AppError.invalidMove('A folder cannot be moved into itself.');
    }

    const moved = await this.prisma.$transaction((tx) => this.nodes.move(node, target.node, tx));
    return toNodeDto(moved);
  }

  /**
   * Removes a node and its whole subtree. Blobs are deleted only after the
   * transaction commits: an orphaned object costs storage, an orphaned row costs
   * the user a document that will not open.
   */
  async remove(nodeId: string, ctx: AccessContext): Promise<{ deleted: SubtreeStats }> {
    const resolved = await this.access.requireWrite(nodeId, ctx);
    if (resolved.node.parentId === null) {
      throw AppError.validation('Delete the data room itself to remove everything in it.');
    }

    const stats = await this.getStats(nodeId, ctx);
    const storageKeys = await this.prisma.$transaction((tx) =>
      this.nodes.deleteSubtree(resolved.node, tx),
    );

    await this.storage.remove(storageKeys);
    return { deleted: stats };
  }

  async search(dataRoomId: string, query: SearchQuery, ctx: AccessContext): Promise<Page<SearchHit>> {
    // Searching is scoped to a node the caller can already open, so a viewer
    // searches inside what was shared with them and nothing wider.
    const scopeId = query.scopeNodeId ?? (await this.rootNodeIdOf(dataRoomId));
    const resolved = await this.access.resolveNode(scopeId, ctx);

    const page = await this.nodes.search(resolved.node, {
      term: query.q,
      type: query.type,
      limit: query.limit,
      cursor: query.cursor,
    });

    const parentIds = [...new Set(page.items.map((item) => item.parentId).filter(isString))];
    const parents = await this.nodes.findManyByIds(parentIds);
    const parentById = new Map(parents.map((parent) => [parent.id, parent]));
    const sharedNodeIds = await this.liveShareNodeIds(page.items.map((item) => item.id));

    const items: SearchHit[] = page.items.map((item) => ({
      node: toNodeDto(item, { isShared: sharedNodeIds.has(item.id) }),
      breadcrumbs: item.parentId
        ? this.trailWithin(parentById.get(item.parentId), resolved.node, parentById)
        : [],
    }));

    return { items, nextCursor: page.nextCursor };
  }

  // --- helpers ----------------------------------------------------------

  /** Ancestors from the caller's access scope down to the node itself. */
  private async breadcrumbs(node: NodeRow, scopeNodeId: string): Promise<BreadcrumbDto[]> {
    const ids = pathIds(node.path);
    const scopeIndex = ids.indexOf(scopeNodeId);
    // Anything above the scope stays invisible: a viewer given one file must not
    // learn the names of the folders it sits in.
    const visible = scopeIndex >= 0 ? ids.slice(scopeIndex) : [node.id];

    const rows = await this.nodes.findManyByIds(visible);
    const byId = new Map(rows.map((row) => [row.id, row]));

    return visible
      .map((id) => byId.get(id))
      .filter((row): row is NodeRow => Boolean(row))
      .map(toBreadcrumb);
  }

  /**
   * The trail for one search hit, walking up only as far as the search scope.
   * Only ancestors already fetched for this page are used, so a page of results
   * costs one extra query rather than one per hit.
   */
  private trailWithin(
    parent: NodeRow | undefined,
    scope: NodeRow,
    known: Map<string, NodeRow>,
  ): BreadcrumbDto[] {
    if (!parent) return [];
    const ids = pathIds(parent.path);
    const scopeIndex = ids.indexOf(scope.id);
    const visible = scopeIndex >= 0 ? ids.slice(scopeIndex) : [parent.id];

    return visible
      .map((id) => (id === scope.id ? scope : known.get(id)))
      .filter((row): row is NodeRow => Boolean(row))
      .map(toBreadcrumb);
  }

  /** Which of these nodes carry a live share, for the "shared" badge. */
  private async liveShareNodeIds(nodeIds: string[]): Promise<Set<string>> {
    if (nodeIds.length === 0) return new Set();

    const shares = await this.prisma.share.findMany({
      where: {
        nodeId: { in: nodeIds },
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { nodeId: true },
      distinct: ['nodeId'],
    });

    return new Set(shares.map((share) => share.nodeId));
  }

  private async rootNodeIdOf(dataRoomId: string): Promise<string> {
    const dataRoom = await this.prisma.dataRoom.findUnique({
      where: { id: dataRoomId },
      select: { rootNodeId: true },
    });
    if (!dataRoom?.rootNodeId) throw AppError.notFound();
    return dataRoom.rootNodeId;
  }
}

function isString(value: string | null): value is string {
  return typeof value === 'string';
}
