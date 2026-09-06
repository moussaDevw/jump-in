import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetPresignedUrlDto } from './dto/get-presigned-url.dto';
import * as crypto from 'crypto';

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('R2_ENDPOINT');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucketName = this.config.get<string>('R2_BUCKET_NAME') || '';
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL') || '';

    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucketName || !this.publicUrl) {
      console.warn('WARNING: Cloudflare R2 environment variables are not fully configured.');
    }

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId || 'placeholder',
        secretAccessKey: secretAccessKey || 'placeholder',
      },
    });
  }

  /**
   * Generates presigned upload URLs (original and optionally a thumbnail).
   */
  async getPresignedUploadUrl(userId: string, dto: GetPresignedUrlDto) {
    const { type, contentType } = dto;

    // Ensure R2 credentials are present for real generation
    const endpoint = this.config.get<string>('R2_ENDPOINT');
    if (!endpoint) {
      throw new BadRequestException('Cloudflare R2 is not configured on the server.');
    }

    const uniqueId = crypto.randomUUID();
    const extension = contentType.split('/')[1] || 'webp';

    // 1. Original file key and URL
    const mainKey = `${type}/${userId}-${uniqueId}.${extension}`;
    const mainUploadUrl = await this.generatePresignedUrl(mainKey, contentType);

    const result: any = {
      original: {
        key: mainKey,
        uploadUrl: mainUploadUrl,
        publicUrl: `${this.publicUrl}/${mainKey}`,
      },
    };

    // 2. Thumbnail file key and URL (only if avatar or event-gallery)
    if (type === 'avatar' || type === 'event-gallery') {
      const thumbKey = `${type}/${userId}-${uniqueId}-thumb.${extension}`;
      const thumbUploadUrl = await this.generatePresignedUrl(thumbKey, contentType);

      result.thumbnail = {
        key: thumbKey,
        uploadUrl: thumbUploadUrl,
        publicUrl: `${this.publicUrl}/${thumbKey}`,
      };
    }

    return result;
  }

  private async generatePresignedUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    // Signed URL valid for 5 minutes (300 seconds)
    return getSignedUrl(this.s3, command, { expiresIn: 300 });
  }
}
