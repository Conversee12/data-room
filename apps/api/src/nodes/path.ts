/**
 * Materialized path helpers.
 *
 * A node's path is the ids of its ancestors and itself, each wrapped in slashes:
 *
 *   root                    /a/
 *   root > Legal            /a/b/
 *   root > Legal > nda.pdf  /a/b/c/
 *
 * The leading and trailing slashes matter: they make `child.path` start with
 * `parent.path` only for genuine descendants, so a prefix comparison can never
 * match a node whose id merely begins with the same characters.
 */

export const PATH_SEPARATOR = '/';

export function rootPath(nodeId: string): string {
  return `${PATH_SEPARATOR}${nodeId}${PATH_SEPARATOR}`;
}

export function childPath(parentPath: string, nodeId: string): string {
  return `${parentPath}${nodeId}${PATH_SEPARATOR}`;
}

/** Ids from the data room root down to and including the node itself. */
export function pathIds(path: string): string[] {
  return path.split(PATH_SEPARATOR).filter(Boolean);
}

/** Ids of every ancestor, nearest last, excluding the node itself. */
export function ancestorIds(path: string): string[] {
  const ids = pathIds(path);
  return ids.slice(0, -1);
}

export function isDescendantOrSelf(candidatePath: string, ancestorPath: string): boolean {
  return candidatePath.startsWith(ancestorPath);
}

export function isStrictDescendant(candidatePath: string, ancestorPath: string): boolean {
  return candidatePath !== ancestorPath && candidatePath.startsWith(ancestorPath);
}

/**
 * The `LIKE` operand that selects a node and everything beneath it. Paths only
 * ever contain hex digits, dashes and slashes, so no `LIKE` metacharacter can
 * appear and no escaping is required.
 */
export function subtreePattern(path: string): string {
  return `${path}%`;
}

export function depthOf(path: string): number {
  return pathIds(path).length - 1;
}
