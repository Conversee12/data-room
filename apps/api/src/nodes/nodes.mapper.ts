import type { BreadcrumbDto, NodeDto } from '@data-room/shared';

import type { NodeRow } from './nodes.repository';

/**
 * `size` is a BigInt in the database because a data room can outgrow 2 GB, and a
 * plain number in the API because JSON has no BigInt. Numbers stay exact to
 * 9 PB, comfortably past any real document set.
 */
export function toNodeDto(row: NodeRow, options: { isShared?: boolean } = {}): NodeDto {
  const isFile = row.type === 'FILE';

  return {
    id: row.id,
    dataRoomId: row.dataRoomId,
    parentId: row.parentId,
    type: row.type,
    name: row.name,
    size: isFile ? Number(row.size) : 0,
    depth: row.depth,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    mimeType: isFile ? (row.currentVersion?.mimeType ?? null) : null,
    versionCount: isFile ? row.versionCount : null,
    isShared: options.isShared ?? false,
  };
}

export function toNodeDtos(rows: NodeRow[], sharedNodeIds: Set<string>): NodeDto[] {
  return rows.map((row) => toNodeDto(row, { isShared: sharedNodeIds.has(row.id) }));
}

export function toBreadcrumb(row: Pick<NodeRow, 'id' | 'name' | 'type'>): BreadcrumbDto {
  return { id: row.id, name: row.name, type: row.type };
}
