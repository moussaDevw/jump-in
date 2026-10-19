import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3StorageProvider } from './s3-storage.provider';
import { BadRequestException } from '@nestjs/common';

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3StorageProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'R2_ENDPOINT') return 'https://test-endpoint.r2.cloudflarestorage.com';
              if (key === 'R2_ACCESS_KEY_ID') return 'test-key-id';
              if (key === 'R2_SECRET_ACCESS_KEY') return 'test-secret';
              if (key === 'R2_BUCKET_NAME') return 'test-bucket';
              if (key === 'R2_PUBLIC_URL') return 'https://cdn.runhub.sn';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<S3StorageProvider>(S3StorageProvider);
  });

  it('should return proper public URL', () => {
    const url = provider.getPublicUrl('avatar/user-1-abc.webp');
    expect(url).toBe('https://cdn.runhub.sn/avatar/user-1-abc.webp');
  });

  it('should throw BadRequestException if R2_ENDPOINT is not configured', async () => {
    const emptyModule: TestingModule = await Test.createTestingModule({
      providers: [
        S3StorageProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => undefined),
          },
        },
      ],
    }).compile();

    const emptyProvider = emptyModule.get<S3StorageProvider>(S3StorageProvider);
    await expect(
      emptyProvider.generatePresignedUploadUrl({
        key: 'test.webp',
        contentType: 'image/webp',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
