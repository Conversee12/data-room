import { Inject, Injectable, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SIGNED_URL_TTL_SECONDS } from '@data-room/shared';

import { ENV, type Env } from '../config/env';

export interface SignedUpload {
  url: string;
  token: string;
  storageKey: string;
}

export interface SignedDownload {
  url: string;
  expiresAt: Date;
}

/**
 * Blob access. The API never carries file bytes: it hands the browser a
 * short-lived signed URL and the browser talks to storage directly. That is what
 * makes per-file progress and parallel uploads possible without a streaming
 * proxy, and it keeps the bucket private — every read is a fresh signed link.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.bucket = env.SUPABASE_STORAGE_BUCKET;
  }

  /**
   * Keys are derived from ids, never from names, so renaming a file is a
   * metadata-only change and two files called `contract.pdf` cannot collide.
   */
  buildKey(input: { dataRoomId: string; nodeId: string; versionId: string }): string {
    return `${input.dataRoomId}/${input.nodeId}/${input.versionId}`;
  }

  async createSignedUpload(storageKey: string): Promise<SignedUpload> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(storageKey, { upsert: true });

    if (error || !data) {
      throw new Error(`Could not create an upload URL: ${error?.message ?? 'unknown error'}`);
    }

    return { url: data.signedUrl, token: data.token, storageKey };
  }

  async createSignedDownload(
    storageKey: string,
    options: { downloadAs?: string; expiresIn?: number } = {},
  ): Promise<SignedDownload> {
    const expiresIn = options.expiresIn ?? SIGNED_URL_TTL_SECONDS;
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(storageKey, expiresIn, {
        // Present only when the user asked to download; otherwise the PDF is
        // rendered inline by the viewer.
        ...(options.downloadAs ? { download: options.downloadAs } : {}),
      });

    if (error || !data) {
      throw new Error(`Could not create a download URL: ${error?.message ?? 'unknown error'}`);
    }

    return { url: data.signedUrl, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  }

  /**
   * Confirms the bytes really arrived before a version is published. Without
   * this, a client that requested an upload URL and never used it would leave a
   * file in the listing that fails to open.
   */
  async getObjectSize(storageKey: string): Promise<number | null> {
    const separator = storageKey.lastIndexOf('/');
    const folder = storageKey.slice(0, separator);
    const name = storageKey.slice(separator + 1);

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .list(folder, { search: name, limit: 1 });

    if (error) throw new Error(`Could not read storage: ${error.message}`);

    const match = data?.find((entry) => entry.name === name);
    if (!match) return null;

    const size = (match.metadata as { size?: number } | null)?.size;
    return typeof size === 'number' ? size : null;
  }

  /**
   * Best effort by design: the database is the record of what exists, so a
   * failed blob deletion is logged and retried by an operator rather than
   * rolling back a delete the user already saw succeed.
   */
  async remove(storageKeys: string[]): Promise<void> {
    if (storageKeys.length === 0) return;

    for (let index = 0; index < storageKeys.length; index += REMOVE_BATCH) {
      const batch = storageKeys.slice(index, index + REMOVE_BATCH);
      const { error } = await this.client.storage.from(this.bucket).remove(batch);
      if (error) {
        this.logger.error(`Failed to remove ${batch.length} object(s): ${error.message}`);
      }
    }
  }
}

/** Supabase rejects very large delete payloads; 100 keys per call is safe. */
const REMOVE_BATCH = 100;
