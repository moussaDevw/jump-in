export interface PresignedUploadUrlOptions {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface IStorageProvider {
  generatePresignedUploadUrl(
    options: PresignedUploadUrlOptions,
  ): Promise<string>;
  getPublicUrl(key: string): string;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
