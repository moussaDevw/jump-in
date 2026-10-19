import { Injectable, Inject } from '@nestjs/common';
import { GetPresignedUrlDto } from './dto/get-presigned-url.dto';
import type { IStorageProvider } from './interfaces/storage-provider.interface';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';
import * as crypto from 'crypto';

@Injectable()
export class UploadService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: IStorageProvider,
  ) {}

  /**
   * Generates presigned upload URLs (original and optionally a thumbnail).
   */
  async getPresignedUploadUrl(userId: string, dto: GetPresignedUrlDto) {
    const { type, contentType } = dto;

    const uniqueId = crypto.randomUUID();
    const extension = contentType.split('/')[1] || 'webp';

    // 1. Original file key and presigned URL
    const mainKey = `${type}/${userId}-${uniqueId}.${extension}`;
    const mainUploadUrl = await this.storageProvider.generatePresignedUploadUrl({
      key: mainKey,
      contentType,
      expiresInSeconds: 300,
    });

    const result: any = {
      original: {
        key: mainKey,
        uploadUrl: mainUploadUrl,
        publicUrl: this.storageProvider.getPublicUrl(mainKey),
      },
    };

    // 2. Thumbnail file key and presigned URL (only if avatar or event-gallery)
    if (type === 'avatar' || type === 'event-gallery') {
      const thumbKey = `${type}/${userId}-${uniqueId}-thumb.${extension}`;
      const thumbUploadUrl =
        await this.storageProvider.generatePresignedUploadUrl({
          key: thumbKey,
          contentType,
          expiresInSeconds: 300,
        });

      result.thumbnail = {
        key: thumbKey,
        uploadUrl: thumbUploadUrl,
        publicUrl: this.storageProvider.getPublicUrl(thumbKey),
      };
    }

    return result;
  }
}
