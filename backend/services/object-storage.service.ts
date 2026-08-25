// ObjectStorageService - thin wrapper around MinIO / S3-compatible storage.
// The Wiki must keep booting when MinIO is missing: all calls throw a clear
// error only when actually used, and startup only performs a non-fatal probe.
import { Client as MinioClient } from 'minio';
import type { Readable } from 'node:stream';
import { config } from '../config.js';

export interface ObjectStorageConfig {
  enabled: boolean;
  endpoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSSL: boolean;
}

export interface ObjectStorageServiceOptions {
  config?: Partial<ObjectStorageConfig>;
  client?: MinioClient;
}

export class ObjectStorageService {
  private readonly cfg: ObjectStorageConfig;
  private readonly injectedClient?: MinioClient;
  private client: MinioClient | null = null;

  constructor(options: ObjectStorageServiceOptions = {}) {
    this.cfg = { ...config.objectStorage, ...options.config };
    this.injectedClient = options.client;
  }

  get bucket(): string {
    return this.cfg.bucket;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.enabled && this.cfg.endpoint && this.cfg.accessKey && this.cfg.secretKey);
  }

  getClient(): MinioClient {
    if (!this.isConfigured()) {
      throw new Error(
        'Object storage is not configured. Set MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, ' +
          'MINIO_SECRET_KEY, MINIO_BUCKET and MINIO_USE_SSL.',
      );
    }
    if (this.injectedClient) return this.injectedClient;
    if (!this.client) {
      this.client = new MinioClient({
        endPoint: this.cfg.endpoint,
        port: this.cfg.port,
        useSSL: this.cfg.useSSL,
        accessKey: this.cfg.accessKey,
        secretKey: this.cfg.secretKey,
      });
    }
    return this.client;
  }

  async putObject(
    key: string,
    data: Buffer | Readable,
    size?: number,
    contentType?: string,
    bucket = this.cfg.bucket,
  ) {
    const metaData = contentType ? { 'Content-Type': contentType } : undefined;
    if (Buffer.isBuffer(data)) {
      return this.getClient().putObject(bucket, key, data, size ?? data.length, metaData);
    }
    if (size === undefined) {
      throw new Error('Stream upload requires an explicit byte size');
    }
    return this.getClient().putObject(bucket, key, data, size, metaData);
  }

  async getObject(key: string, bucket = this.cfg.bucket): Promise<Readable> {
    return this.getClient().getObject(bucket, key);
  }

  async deleteObject(key: string, bucket = this.cfg.bucket): Promise<void> {
    await this.getClient().removeObject(bucket, key);
  }

  async headObject(key: string, bucket = this.cfg.bucket) {
    return this.getClient().statObject(bucket, key);
  }

  async getPresignedUrl(key: string, expiresSeconds = 900, bucket = this.cfg.bucket): Promise<string> {
    return this.getClient().presignedGetObject(bucket, key, expiresSeconds);
  }

  /** Non-fatal startup probe: returns { ok, reason } and never throws. */
  async checkHealth(timeoutMs = 3000): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        reason: 'MINIO_ACCESS_KEY/MINIO_SECRET_KEY not set; object storage disabled',
      };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const probe = async (): Promise<{ ok: boolean; reason?: string }> => {
        const exists = await this.getClient().bucketExists(this.cfg.bucket);
        return exists
          ? { ok: true }
          : { ok: false, reason: `bucket "${this.cfg.bucket}" does not exist` };
      };
      const timeout = new Promise<{ ok: false; reason: string }>((resolve) => {
        timer = setTimeout(
          () => resolve({ ok: false, reason: 'MinIO health check timed out' }),
          timeoutMs,
        );
      });
      return await Promise.race([probe(), timeout]);
    } catch (err) {
      return { ok: false, reason: `MinIO unreachable: ${(err as Error).message}` };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/** Bootstrap-friendly probe: never throws, so a missing MinIO cannot stop boot. */
export async function safeObjectStorageProbe(
  storage: Pick<ObjectStorageService, 'checkHealth'>,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    return await storage.checkHealth();
  } catch (err) {
    return { ok: false, reason: `Object storage check failed: ${(err as Error).message}` };
  }
}

export const objectStorageService = new ObjectStorageService();
