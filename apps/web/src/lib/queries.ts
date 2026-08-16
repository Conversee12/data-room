'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import type {
  CreateDataRoomInput,
  CreateShareInput,
  DataRoomDto,
  FileContentUrl,
  FileVersionDto,
  ListChildrenQuery,
  NodeDetail,
  NodeDto,
  Page,
  SearchHit,
  ShareContext,
  ShareDto,
  SharedWithMeItem,
  SubtreeStats,
  UpdateDataRoomInput,
  UploadIntent,
  UploadIntentInput,
} from '@data-room/shared';

import { apiFetch, type RequestOptions } from './api';
import { useAccess } from './access-context';
import { useAuth } from './auth-context';

export const keys = {
  dataRooms: ['data-rooms'] as const,
  dataRoom: (id: string) => ['data-rooms', id] as const,
  sharedWithMe: ['shared-with-me'] as const,
  node: (id: string) => ['nodes', id] as const,
  children: (id: string, sort: string, direction: string) =>
    ['nodes', id, 'children', sort, direction] as const,
  stats: (id: string) => ['nodes', id, 'stats'] as const,
  versions: (id: string) => ['nodes', id, 'versions'] as const,
  shares: (id: string) => ['nodes', id, 'shares'] as const,
  shareContext: (token: string) => ['shares', 'token', token] as const,
  search: (dataRoomId: string, term: string, scope: string | undefined) =>
    ['search', dataRoomId, term, scope ?? 'root'] as const,
};

/**
 * A fetch already carrying whichever credential this screen has: the owner's
 * bearer token, a share token, or neither.
 */
function useApi() {
  const { token } = useAuth();
  const { shareToken } = useAccess();

  return useCallback(
    <T,>(path: string, options: Omit<RequestOptions, 'token' | 'shareToken'> = {}) =>
      apiFetch<T>(path, { ...options, token, shareToken }),
    [token, shareToken],
  );
}

// --- data rooms ---------------------------------------------------------

export function useDataRooms() {
  const api = useApi();
  const { status } = useAuth();

  return useQuery({
    queryKey: keys.dataRooms,
    queryFn: () => api<DataRoomDto[]>('/data-rooms'),
    enabled: status === 'signed-in',
  });
}

export function useSharedWithMe() {
  const api = useApi();
  const { status } = useAuth();

  return useQuery({
    queryKey: keys.sharedWithMe,
    queryFn: () => api<SharedWithMeItem[]>('/data-rooms/shared-with-me'),
    enabled: status === 'signed-in',
  });
}

export function useCreateDataRoom() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDataRoomInput) =>
      api<DataRoomDto>('/data-rooms', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.dataRooms }),
  });
}

export function useUpdateDataRoom(dataRoomId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateDataRoomInput) =>
      api<DataRoomDto>(`/data-rooms/${dataRoomId}`, { method: 'PATCH', body: input }),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: keys.dataRooms });
      // The room's name is also its root folder's name.
      queryClient.invalidateQueries({ queryKey: keys.node(room.rootNodeId) });
    },
  });
}

export function useDeleteDataRoom() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dataRoomId: string) =>
      api<{ deleted: SubtreeStats }>(`/data-rooms/${dataRoomId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.dataRooms }),
  });
}

// --- tree ---------------------------------------------------------------

export function useNode(nodeId: string | null) {
  const api = useApi();

  return useQuery({
    queryKey: keys.node(nodeId ?? ''),
    queryFn: () => api<NodeDetail>(`/nodes/${nodeId}`),
    enabled: Boolean(nodeId),
    // Someone else may have renamed or removed this while the tab sat open.
    retry: (failureCount, error) => failureCount < 2 && !isTerminal(error),
  });
}

export function useChildren(
  nodeId: string | null,
  sort: ListChildrenQuery['sort'] = 'name',
  direction: ListChildrenQuery['direction'] = 'asc',
) {
  const api = useApi();

  return useInfiniteQuery({
    queryKey: keys.children(nodeId ?? '', sort, direction),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ sort, direction, limit: '50' });
      if (pageParam) params.set('cursor', pageParam);
      return api<Page<NodeDto>>(`/nodes/${nodeId}/children?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(nodeId),
    retry: (failureCount, error) => failureCount < 2 && !isTerminal(error),
  });
}

/** Loaded on demand, because it is only needed to warn before a delete. */
export function useSubtreeStats(nodeId: string | null, enabled: boolean) {
  const api = useApi();

  return useQuery({
    queryKey: keys.stats(nodeId ?? ''),
    queryFn: () => api<SubtreeStats>(`/nodes/${nodeId}/stats`),
    enabled: Boolean(nodeId) && enabled,
    staleTime: 0,
  });
}

export function useCreateFolder(parentId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      api<NodeDto>('/folders', { method: 'POST', body: { parentId, name } }),
    onSuccess: () => invalidateFolder(queryClient, parentId),
  });
}

export function useRenameNode() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ nodeId, name }: { nodeId: string; name: string }) =>
      api<NodeDto>(`/nodes/${nodeId}`, { method: 'PATCH', body: { name } }),
    onSuccess: (node) => {
      queryClient.invalidateQueries({ queryKey: keys.node(node.id) });
      if (node.parentId) invalidateFolder(queryClient, node.parentId);
      queryClient.invalidateQueries({ queryKey: keys.dataRooms });
    },
  });
}

export function useMoveNode() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ nodeId, parentId }: { nodeId: string; parentId: string; fromParentId: string }) =>
      api<NodeDto>(`/nodes/${nodeId}/move`, { method: 'POST', body: { parentId } }),
    onSuccess: (node, variables) => {
      // Both ends of the move changed, and every descendant's breadcrumb did too.
      invalidateFolder(queryClient, variables.fromParentId);
      invalidateFolder(queryClient, variables.parentId);
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
    },
  });
}

export function useDeleteNode() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ nodeId }: { nodeId: string; parentId: string | null }) =>
      api<{ deleted: SubtreeStats }>(`/nodes/${nodeId}`, { method: 'DELETE' }),
    onSuccess: (_result, variables) => {
      if (variables.parentId) invalidateFolder(queryClient, variables.parentId);
      queryClient.removeQueries({ queryKey: keys.node(variables.nodeId) });
      queryClient.invalidateQueries({ queryKey: keys.dataRooms });
    },
  });
}

// --- files --------------------------------------------------------------

/**
 * Signed URLs expire, so this is deliberately short-lived in the cache: a viewer
 * left open past the expiry refetches rather than showing a broken document.
 */
export function useFileContent(nodeId: string | null, versionId?: string) {
  const api = useApi();

  return useQuery({
    queryKey: ['nodes', nodeId, 'content', versionId ?? 'current'],
    queryFn: () =>
      api<FileContentUrl>(
        `/nodes/${nodeId}/content${versionId ? `?versionId=${versionId}` : ''}`,
      ),
    enabled: Boolean(nodeId),
    staleTime: 5 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Asks for a signed URL that carries a content-disposition, so the browser saves
 * the file under its display name instead of opening it inline. Requested on
 * click rather than held in advance, because these URLs are short-lived.
 */
export function useDownloadUrl() {
  const api = useApi();

  return useCallback(
    async (nodeId: string, versionId?: string) => {
      const params = new URLSearchParams({ download: '1' });
      if (versionId) params.set('versionId', versionId);
      const content = await api<FileContentUrl>(`/nodes/${nodeId}/content?${params.toString()}`);
      return content.url;
    },
    [api],
  );
}

export function useFileVersions(nodeId: string | null, enabled: boolean) {
  const api = useApi();

  return useQuery({
    queryKey: keys.versions(nodeId ?? ''),
    queryFn: () => api<FileVersionDto[]>(`/nodes/${nodeId}/versions`),
    enabled: Boolean(nodeId) && enabled,
  });
}

export function useUploadApi() {
  const api = useApi();

  return {
    createIntent: (input: UploadIntentInput) =>
      api<UploadIntent>('/uploads', { method: 'POST', body: input }),
    complete: (versionId: string) =>
      api<NodeDto>(`/uploads/${versionId}/complete`, { method: 'POST' }),
    abort: (versionId: string) => api<void>(`/uploads/${versionId}`, { method: 'DELETE' }),
  };
}

// --- sharing ------------------------------------------------------------

export function useShares(nodeId: string | null, enabled: boolean) {
  const api = useApi();

  return useQuery({
    queryKey: keys.shares(nodeId ?? ''),
    queryFn: () => api<ShareDto[]>(`/nodes/${nodeId}/shares`),
    enabled: Boolean(nodeId) && enabled,
  });
}

export function useShareContext(token: string) {
  const api = useApi();

  return useQuery({
    queryKey: keys.shareContext(token),
    queryFn: () => api<ShareContext>(`/shares/token/${token}`),
    retry: false,
  });
}

export function useCreateShare(nodeId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<CreateShareInput, 'nodeId'>) =>
      api<ShareDto>('/shares', { method: 'POST', body: { ...input, nodeId } }),
    onSuccess: () => invalidateSharing(queryClient, nodeId),
  });
}

export function useRevokeShare(nodeId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shareId: string) => api<void>(`/shares/${shareId}`, { method: 'DELETE' }),
    onSuccess: () => invalidateSharing(queryClient, nodeId),
  });
}

export function useAddGrant(nodeId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ shareId, email }: { shareId: string; email: string }) =>
      api<ShareDto>(`/shares/${shareId}/grants`, { method: 'POST', body: { email } }),
    onSuccess: () => invalidateSharing(queryClient, nodeId),
  });
}

export function useRevokeGrant(nodeId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ shareId, grantId }: { shareId: string; grantId: string }) =>
      api<ShareDto>(`/shares/${shareId}/grants/${grantId}`, { method: 'DELETE' }),
    onSuccess: () => invalidateSharing(queryClient, nodeId),
  });
}

// --- search -------------------------------------------------------------

export function useSearch(dataRoomId: string | null, term: string, scopeNodeId?: string) {
  const api = useApi();
  const trimmed = term.trim();

  return useQuery({
    queryKey: keys.search(dataRoomId ?? '', trimmed, scopeNodeId),
    queryFn: () => {
      const params = new URLSearchParams({ q: trimmed, limit: '50' });
      if (scopeNodeId) params.set('scopeNodeId', scopeNodeId);
      return api<Page<SearchHit>>(`/data-rooms/${dataRoomId}/search?${params.toString()}`);
    },
    enabled: Boolean(dataRoomId) && trimmed.length > 0,
    placeholderData: (previous) => previous,
  });
}

// --- helpers ------------------------------------------------------------

function invalidateFolder(queryClient: QueryClient, folderId: string): void {
  queryClient.invalidateQueries({ queryKey: ['nodes', folderId] });
  // Folder totals shown on the rooms list move whenever contents do.
  queryClient.invalidateQueries({ queryKey: keys.dataRooms });
}

function invalidateSharing(queryClient: QueryClient, nodeId: string): void {
  queryClient.invalidateQueries({ queryKey: keys.shares(nodeId) });
  queryClient.invalidateQueries({ queryKey: keys.node(nodeId) });
  queryClient.invalidateQueries({ queryKey: keys.sharedWithMe });
}

/** Retrying these only delays the message the user needs to see. */
function isTerminal(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return (
    code === 'NOT_FOUND' ||
    code === 'FORBIDDEN' ||
    code === 'SHARE_REVOKED' ||
    code === 'SHARE_EXPIRED' ||
    code === 'UNAUTHENTICATED'
  );
}
