export type NodeType = 'FOLDER' | 'FILE';
export type ShareMode = 'PUBLIC_LINK' | 'RESTRICTED';
export type ShareRole = 'VIEWER';

/**
 * What the caller may do with the node they asked for. `OWNER` comes from
 * owning the data room; `VIEWER` from a share that covers the node.
 */
export type AccessRole = 'OWNER' | 'VIEWER';

/**
 * Stable error codes. The UI branches on these rather than on message text, so
 * wording can change without breaking behaviour.
 */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NAME_CONFLICT'
  | 'INVALID_MOVE'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'SHARE_REVOKED'
  | 'SHARE_EXPIRED'
  | 'UPLOAD_INCOMPLETE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'INTERNAL';

export interface ApiError {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  /** Field-level messages for VALIDATION_FAILED. */
  details?: Record<string, string[]>;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: UserDto;
}

/** Aggregate over a whole subtree, computed with one indexed prefix scan. */
export interface SubtreeStats {
  fileCount: number;
  folderCount: number;
  /** Bytes. Safe as a JS number up to 9 PB. */
  totalSize: number;
}

export interface DataRoomDto {
  id: string;
  name: string;
  description: string | null;
  rootNodeId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  stats: SubtreeStats;
}

export interface FileVersionDto {
  id: string;
  version: number;
  size: number;
  mimeType: string;
  createdAt: string;
  uploadedBy: UserDto;
  isCurrent: boolean;
}

export interface NodeDto {
  id: string;
  dataRoomId: string;
  parentId: string | null;
  type: NodeType;
  name: string;
  /** Files: bytes of the current version. Folders: always 0, use `stats`. */
  size: number;
  depth: number;
  createdAt: string;
  updatedAt: string;
  /** Present for files only. */
  mimeType: string | null;
  /** Present for files only: how many versions exist. */
  versionCount: number | null;
  /** True when this node, or an ancestor, has at least one live share. */
  isShared: boolean;
}

/**
 * Ancestors the caller is allowed to know about: the trail starts at their
 * access scope, so someone given one file never learns the folder names above it.
 */
export interface BreadcrumbDto {
  id: string;
  name: string;
  type: NodeType;
}

export interface AccessInfo {
  role: AccessRole;
  canWrite: boolean;
  canShare: boolean;
  /** The node the caller's permission is anchored at. */
  scopeNodeId: string;
}

export interface NodeDetail {
  node: NodeDto;
  breadcrumbs: BreadcrumbDto[];
  dataRoom: Pick<DataRoomDto, 'id' | 'name'>;
  access: AccessInfo;
}

export interface Page<T> {
  items: T[];
  /** Opaque; pass back as `cursor`. Null when the last page was returned. */
  nextCursor: string | null;
}

export interface UploadIntent {
  nodeId: string;
  versionId: string;
  /** May differ from the requested name when a conflict was auto-resolved. */
  name: string;
  /** PUT the bytes here. Expires; request a new intent if it lapses. */
  uploadUrl: string;
  storageKey: string;
  /** Supabase signed-upload token, sent as a header alongside the PUT. */
  uploadToken: string | null;
  /** Set when an existing file gained a new version instead of a new node. */
  replacedVersionOf: string | null;
}

export interface ShareGrantDto {
  id: string;
  email: string;
  role: ShareRole;
  /** Set once the invited email matches a registered account. */
  user: UserDto | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ShareDto {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeType: NodeType;
  /** True when the shared node is the data room's root. */
  isDataRoomShare: boolean;
  mode: ShareMode;
  role: ShareRole;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  grants: ShareGrantDto[];
}

/** What a visitor arriving at /s/<token> is allowed to see. */
export interface ShareContext {
  share: Pick<ShareDto, 'id' | 'mode' | 'role' | 'token' | 'expiresAt' | 'isDataRoomShare'>;
  /** The subtree root the visitor may browse. */
  node: NodeDto;
  dataRoom: Pick<DataRoomDto, 'id' | 'name'>;
  sharedBy: UserDto;
}

/** An item someone else shared with the signed-in user. */
export interface SharedWithMeItem {
  share: Pick<ShareDto, 'id' | 'mode' | 'role' | 'token' | 'expiresAt' | 'isDataRoomShare'>;
  node: NodeDto;
  dataRoom: Pick<DataRoomDto, 'id' | 'name'>;
  sharedBy: UserDto;
}

export interface SearchHit {
  node: NodeDto;
  /** Ancestors from the search scope down to the file's folder. */
  breadcrumbs: BreadcrumbDto[];
}

/** Signed, short-lived URL for viewing or downloading a file's bytes. */
export interface FileContentUrl {
  url: string;
  expiresAt: string;
  mimeType: string;
  name: string;
  size: number;
}
