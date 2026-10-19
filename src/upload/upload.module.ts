import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';
import { S3StorageProvider } from './providers/s3-storage.provider';

@Module({
  controllers: [UploadController],
  providers: [
    UploadService,
    {
      provide: STORAGE_PROVIDER,
      useClass: S3StorageProvider,
    },
  ],
  exports: [UploadService, STORAGE_PROVIDER],
})
export class UploadModule {}
