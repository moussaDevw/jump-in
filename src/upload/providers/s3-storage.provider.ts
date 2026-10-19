import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  IStorageProvider,
  PresignedUploadUrlOptions,
} from '../interfaces/storage-provider.interface';

@Injectable()
export class S3StorageProvider implements IStorageProvider {
  private readonly s3: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

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

  async generatePresignedUploadUrl(options: PresignedUploadUrlOptions): Promise<string> {
    const { key, contentType, expiresInSeconds = 300 } = options;

    const endpoint = this.config.get<string>('R2_ENDPOINT');
    if (!endpoint) {
      throw new BadRequestException('Cloudflare R2 is not configured on the server.');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }
}
