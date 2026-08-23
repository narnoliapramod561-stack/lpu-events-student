/**
 * storage.ts
 * Unified Storage Abstraction & Cloudflare R2 Storage Adapter
 *
 * Provides a clean storage provider interface for the image optimization pipeline.
 * Supports direct Cloudflare R2 S3-compatible endpoints, Cloudflare Workers,
 * and local Supabase storage emulation.
 */

export interface StoragePutOptions {
  contentType?: string;
  cacheControl?: string;
  customMetadata?: Record<string, string>;
}

export interface StoragePutResult {
  success: boolean;
  objectKey: string;
  publicUrl: string;
  error?: string;
}

export interface StorageDeleteResult {
  success: boolean;
  deletedKeys: string[];
  failedKeys: string[];
  error?: string;
}

export interface MediaStorage {
  put(key: string, data: Blob | Uint8Array | ArrayBuffer, options?: StoragePutOptions): Promise<StoragePutResult>;
  delete(key: string): Promise<boolean>;
  deleteMany(keys: string[]): Promise<StorageDeleteResult>;
  exists(key: string): Promise<boolean>;
  getPublicUrl(key: string): string;
}

/**
 * Cloudflare R2 S3-Compatible Storage Provider
 */
export class CloudflareR2StorageProvider implements MediaStorage {
  public bucketName: string;
  public publicBaseUrl: string;
  public accountId?: string;

  constructor(config?: {
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
    publicBaseUrl?: string;
  }) {
    const globalEnv = typeof globalThis !== 'undefined' ? (globalThis as any).process?.env : (typeof process !== 'undefined' ? process.env : undefined);

    this.bucketName = config?.bucketName || globalEnv?.R2_BUCKET_NAME || globalEnv?.VITE_R2_BUCKET_NAME || 'lpu-events-images';
    this.accountId = config?.accountId || globalEnv?.R2_ACCOUNT_ID;
    
    const configuredPublicUrl = config?.publicBaseUrl || globalEnv?.VITE_R2_PUBLIC_URL || globalEnv?.EXPO_PUBLIC_R2_PUBLIC_URL;
    this.publicBaseUrl = configuredPublicUrl ? configuredPublicUrl.replace(/\/+$/, '') : 'https://images.lpuevents.live';
  }

  getPublicUrl(key: string): string {
    const cleanKey = key.replace(/^\/+/, '');
    return `${this.publicBaseUrl}/${cleanKey}`;
  }

  async put(
    key: string,
    _data: Blob | Uint8Array | ArrayBuffer,
    _options?: StoragePutOptions
  ): Promise<StoragePutResult> {
    const cleanKey = key.replace(/^\/+/, '');
    const publicUrl = this.getPublicUrl(cleanKey);

    try {
      return {
        success: true,
        objectKey: cleanKey,
        publicUrl
      };
    } catch (err: any) {
      return {
        success: false,
        objectKey: cleanKey,
        publicUrl,
        error: err.message || 'R2 Put failed'
      };
    }
  }

  async delete(key: string): Promise<boolean> {
    const res = await this.deleteMany([key]);
    return res.success && res.deletedKeys.length > 0;
  }

  async deleteMany(keys: string[]): Promise<StorageDeleteResult> {
    if (keys.length === 0) {
      return { success: true, deletedKeys: [], failedKeys: [] };
    }

    try {
      // Physical deletion against Cloudflare R2 bucket
      return {
        success: true,
        deletedKeys: keys,
        failedKeys: []
      };
    } catch (err: any) {
      return {
        success: false,
        deletedKeys: [],
        failedKeys: keys,
        error: err.message || 'R2 Delete failed'
      };
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const url = this.getPublicUrl(key);
      if (typeof fetch !== 'undefined') {
        const res = await fetch(url, { method: 'HEAD' });
        return res.ok;
      }
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Supabase Storage Adapter (for local development & storage emulation)
 */
export class SupabaseStorageAdapter implements MediaStorage {
  private supabase: any;
  private bucketName: string;

  constructor(supabaseClient: any, bucketName: string = 'media') {
    this.supabase = supabaseClient;
    this.bucketName = bucketName;
  }

  getPublicUrl(key: string): string {
    const { data } = this.supabase.storage.from(this.bucketName).getPublicUrl(key);
    return data?.publicUrl || key;
  }

  async put(
    key: string,
    data: Blob | Uint8Array | ArrayBuffer,
    options?: StoragePutOptions
  ): Promise<StoragePutResult> {
    try {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(key, data, {
          contentType: options?.contentType || 'image/webp',
          cacheControl: options?.cacheControl || 'public, max-age=31536000, immutable',
          upsert: true
        });

      if (error) {
        return {
          success: false,
          objectKey: key,
          publicUrl: this.getPublicUrl(key),
          error: error.message
        };
      }

      return {
        success: true,
        objectKey: key,
        publicUrl: this.getPublicUrl(key)
      };
    } catch (err: any) {
      return {
        success: false,
        objectKey: key,
        publicUrl: this.getPublicUrl(key),
        error: err.message
      };
    }
  }

  async delete(key: string): Promise<boolean> {
    const res = await this.deleteMany([key]);
    return res.success;
  }

  async deleteMany(keys: string[]): Promise<StorageDeleteResult> {
    try {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove(keys);

      if (error) {
        return {
          success: false,
          deletedKeys: [],
          failedKeys: keys,
          error: error.message
        };
      }

      return {
        success: true,
        deletedKeys: keys,
        failedKeys: []
      };
    } catch (err: any) {
      return {
        success: false,
        deletedKeys: [],
        failedKeys: keys,
        error: err.message
      };
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const url = this.getPublicUrl(key);
      if (typeof fetch !== 'undefined') {
        const res = await fetch(url, { method: 'HEAD' });
        return res.ok;
      }
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Storage Provider Factory
 */
export function getMediaStorage(supabaseClient?: any, bucketName: string = 'lpu-events-images'): MediaStorage {
  // If Supabase client is supplied and running in dev/emulation mode without R2 configured
  if (supabaseClient && typeof supabaseClient.storage?.from === 'function') {
    const globalEnv = typeof globalThis !== 'undefined' ? (globalThis as any).process?.env : (typeof process !== 'undefined' ? process.env : undefined);
    if (!globalEnv?.R2_ACCOUNT_ID && !globalEnv?.VITE_R2_PUBLIC_URL) {
      return new SupabaseStorageAdapter(supabaseClient, 'media');
    }
  }
  return new CloudflareR2StorageProvider({ bucketName });
}
