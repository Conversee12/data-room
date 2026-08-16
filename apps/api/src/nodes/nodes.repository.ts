import { Injectable } from '@nestjs/common';
import { Prisma, type NodeType } from '@data-room/db';
import { toNameKey, type ListChildrenQuery, type SubtreeStats } from '@data-room/shared';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { childPath, rootPath, subtreePattern } from './path';

/** Accepts either the root client or an open transaction. */
export type Db = PrismaService | Prisma.TransactionClient;

export const nodeSelect = {
  id: true,
  dataRoomId: true,
  parentId: true,
  type: true,
  name: true,
  nameKey: true,
  path: true,
  depth: true,
  size: true,
  versionCount: true,
  currentVersionId: true,
  createdAt: true,
  updatedAt: true,
  currentVersion: { select: { mimeType: true } },
} satisfies Prisma.NodeSelect;

export type NodeRow = Prisma.NodeGetPayload<{ select: typeof nodeSelect }>;

/**
 * All reads and writes against the node tree. Keeping the path arithmetic in one
 * place is what stops `move` and `delete` from drifting apart.
 */
@Injectable()
export class NodesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Db): Db {
    return tx ?? this.prisma;
  }

  // --- creation ---------------------------------------------------------

  /**
   * A data room and its root folder are created together: every other operation
   * assumes the root exists, so it is never a separate, skippable step.
   */
  async createDataRoomWithRoot(
    tx: Db,
    input: { ownerId: string; name: string; description: string | null },
  ): Promise<{ id: string; rootNodeId: string }> {
    const db = this.db(tx);

    const dataRoom = await db.dataRoom.create({
      data: { name: input.name, description: input.description, ownerId: input.ownerId },
      select: { id: true },
    });

    const rootId = crypto.randomUUID();
    await db.node.create({
      data: {
        id: rootId,
        dataRoomId: dataRoom.id,
        parentId: null,
        type: 'FOLDER',
        name: input.name,
        nameKey: toNameKey(input.name),
        path: rootPath(rootId),
        depth: 0,
        createdById: input.ownerId,
      },
    });

    await db.dataRoom.update({ where: { id: dataRoom.id }, data: { rootNodeId: rootId } });
    return { id: dataRoom.id, rootNodeId: rootId };
  }

  async createChild(
    tx: Db,
    input: {
      parent: NodeRow;
      type: NodeType;
      name: string;
      createdById: string;
      id?: string;
    },
  ): Promise<NodeRow> {
    const db = this.db(tx);
    const id = input.id ?? crypto.randomUUID();

    return this.guardNameConflict(input.name, () =>
      db.node.create({
        data: {
          id,
          dataRoomId: input.parent.dataRoomId,
          parentId: input.parent.id,
          type: input.type,
          name: input.name,
          nameKey: toNameKey(input.name),
          path: childPath(input.parent.path, id),
          depth: input.parent.depth + 1,
          createdById: input.createdById,
        },
        select: nodeSelect,
      }),
    );
  }

  // --- reads ------------------------------------------------------------

  async findById(id: string, tx?: Db): Promise<NodeRow | null> {
    return this.db(tx).node.findUnique({ where: { id }, select: nodeSelect });
  }

  async requireById(id: string, tx?: Db): Promise<NodeRow> {
    const node = await this.findById(id, tx);
    if (!node) throw AppError.notFound();
    return node;
  }

  async findManyByIds(ids: string[], tx?: Db): Promise<NodeRow[]> {
    if (ids.length === 0) return [];
    return this.db(tx).node.findMany({ where: { id: { in: ids } }, select: nodeSelect });
  }

  /**
   * One page of a folder's contents. Folders always sort before files — matching
   * every file manager users already know — and the requested sort only orders
   * within those two groups.
   */
  async listChildren(
    parentId: string,
    query: ListChildrenQuery,
    tx?: Db,
  ): Promise<{ items: NodeRow[]; nextCursor: string | null }> {
    const orderBy = buildOrderBy(query);

    const rows = await this.db(tx).node.findMany({
      where: {
        parentId,
        // A file whose upload never completed has no current version. It holds
        // its name so a retry keeps it, but it is not something to display.
        OR: [{ type: 'FOLDER' }, { currentVersionId: { not: null } }],
      },
      select: nodeSelect,
      orderBy,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  /** Name keys already used in a folder, for client-side conflict resolution. */
  async takenNameKeys(parentId: string, tx?: Db): Promise<string[]> {
    const rows = await this.db(tx).node.findMany({
      where: { parentId },
      select: { nameKey: true },
    });
    return rows.map((row) => row.nameKey);
  }

  /**
   * Size and item count for a whole subtree in a single indexed prefix scan.
   * `size` is denormalized onto every file node, so this never touches
   * `file_versions` and stays O(rows in subtree) with no recursion.
   */
  async subtreeStats(node: NodeRow, tx?: Db): Promise<SubtreeStats> {
    const rows = await this.db(tx).$queryRaw<
      { file_count: bigint; folder_count: bigint; total_size: bigint }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE n."type" = 'FILE' AND n."currentVersionId" IS NOT NULL)
          AS file_count,
        COUNT(*) FILTER (WHERE n."type" = 'FOLDER') AS folder_count,
        COALESCE(SUM(n."size"), 0) AS total_size
      FROM "nodes" n
      WHERE n."dataRoomId" = ${node.dataRoomId}::uuid
        AND n."path" LIKE ${subtreePattern(node.path)}
        AND n."id" <> ${node.id}::uuid
    `;

    const row = rows[0];
    return {
      fileCount: Number(row?.file_count ?? 0),
      folderCount: Number(row?.folder_count ?? 0),
      totalSize: Number(row?.total_size ?? 0),
    };
  }

  /**
   * Stats for several data rooms in one query, so the rooms list does not fan
   * out into one aggregate per card. A room's subtree is all of its nodes, so
   * this groups instead of scanning prefixes.
   */
  async statsByDataRoom(dataRoomIds: string[], tx?: Db): Promise<Map<string, SubtreeStats>> {
    const result = new Map<string, SubtreeStats>();
    if (dataRoomIds.length === 0) return result;

    const rows = await this.db(tx).$queryRaw<
      { dataRoomId: string; file_count: bigint; folder_count: bigint; total_size: bigint }[]
    >`
      SELECT n."dataRoomId",
             COUNT(*) FILTER (WHERE n."type" = 'FILE' AND n."currentVersionId" IS NOT NULL)
               AS file_count,
             COUNT(*) FILTER (WHERE n."type" = 'FOLDER' AND n."parentId" IS NOT NULL)
               AS folder_count,
             COALESCE(SUM(n."size"), 0) AS total_size
      FROM "nodes" n
      WHERE n."dataRoomId" IN (${Prisma.join(dataRoomIds.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY n."dataRoomId"
    `;

    for (const row of rows) {
      result.set(row.dataRoomId, {
        fileCount: Number(row.file_count),
        folderCount: Number(row.folder_count),
        totalSize: Number(row.total_size),
      });
    }
    return result;
  }

  /**
   * Files (and optionally folders) whose name matches, anywhere below `scope`.
   * The scope is a path prefix, so the same query serves a data room search and
   * a search inside a shared folder.
   */
  async search(
    scope: NodeRow,
    options: { term: string; type: 'ALL' | 'FOLDER' | 'FILE'; limit: number; cursor?: string },
    tx?: Db,
  ): Promise<{ items: NodeRow[]; nextCursor: string | null }> {
    const rows = await this.db(tx).node.findMany({
      where: {
        dataRoomId: scope.dataRoomId,
        path: { startsWith: scope.path },
        id: { not: scope.id },
        nameKey: { contains: toNameKey(options.term) },
        ...(options.type === 'ALL'
          ? { OR: [{ type: 'FOLDER' }, { currentVersionId: { not: null } }] }
          : { type: options.type, ...(options.type === 'FILE' ? { currentVersionId: { not: null } } : {}) }),
      },
      select: nodeSelect,
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > options.limit;
    const items = hasMore ? rows.slice(0, options.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  // --- mutations --------------------------------------------------------

  async rename(node: NodeRow, name: string, tx?: Db): Promise<NodeRow> {
    return this.guardNameConflict(name, () =>
      this.db(tx).node.update({
        where: { id: node.id },
        data: { name, nameKey: toNameKey(name) },
        select: nodeSelect,
      }),
    );
  }

  /**
   * Reparents a node and rewrites the materialized path of its whole subtree in
   * one statement, so a move of 10,000 documents is a single round trip and
   * cannot leave descendants pointing at the old location.
   */
  async move(node: NodeRow, newParent: NodeRow, tx: Db): Promise<NodeRow> {
    const db = this.db(tx);
    const newPath = childPath(newParent.path, node.id);
    const depthDelta = newParent.depth + 1 - node.depth;

    const moved = await this.guardNameConflict(node.name, () =>
      db.node.update({
        where: { id: node.id },
        data: { parentId: newParent.id, path: newPath, depth: newParent.depth + 1 },
        select: nodeSelect,
      }),
    );

    // The `::int` casts are load-bearing: numeric parameters arrive as bigint,
    // and neither `substring(text, bigint)` nor an int column assignment from
    // bigint arithmetic exists without them.
    await db.$executeRaw`
      UPDATE "nodes"
      SET "path" = ${newPath} || SUBSTRING("path" FROM ${node.path.length + 1}::int),
          "depth" = "depth" + ${depthDelta}::int,
          "updatedAt" = NOW()
      WHERE "dataRoomId" = ${node.dataRoomId}::uuid
        AND "path" LIKE ${subtreePattern(node.path)}
        AND "id" <> ${node.id}::uuid
    `;

    return moved;
  }

  /**
   * Deletes a node and everything under it. The database cascades the rows; this
   * returns the storage keys so the caller can purge the blobs once the
   * transaction has actually committed.
   */
  async deleteSubtree(node: NodeRow, tx: Db): Promise<string[]> {
    const db = this.db(tx);

    const versions = await db.$queryRaw<{ storageKey: string }[]>`
      SELECT fv."storageKey"
      FROM "file_versions" fv
      JOIN "nodes" n ON n."id" = fv."nodeId"
      WHERE n."dataRoomId" = ${node.dataRoomId}::uuid
        AND n."path" LIKE ${subtreePattern(node.path)}
    `;

    await db.node.delete({ where: { id: node.id } });
    return versions.map((version) => version.storageKey);
  }

  // --- helpers ----------------------------------------------------------

  /**
   * Turns the database's uniqueness violation into a message about the name the
   * user typed. Checking first and inserting afterwards would let two concurrent
   * uploads both pass the check.
   */
  private async guardNameConflict<T>(name: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta?.target as string[] | undefined)?.includes('nameKey')
      ) {
        throw AppError.nameConflict(name);
      }
      throw error;
    }
  }
}

function buildOrderBy(query: ListChildrenQuery): Prisma.NodeOrderByWithRelationInput[] {
  // `type` ascends FOLDER then FILE, matching the enum's declaration order.
  const grouping: Prisma.NodeOrderByWithRelationInput = { type: 'asc' };

  switch (query.sort) {
    case 'updatedAt':
      return [grouping, { updatedAt: query.direction }, { id: 'asc' }];
    case 'size':
      return [grouping, { size: query.direction }, { name: 'asc' }, { id: 'asc' }];
    case 'name':
    default:
      return [grouping, { name: query.direction }, { id: 'asc' }];
  }
}
