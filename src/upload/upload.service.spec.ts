import { Test, TestingModule } from '@nestjs/testing';
import { UploadService } from './upload.service';
import {
  IStorageProvider,
  STORAGE_PROVIDER,
} from './interfaces/storage-provider.interface';

describe('UploadService', () => {
  let service: UploadService;
  let mockStorageProvider: jest.Mocked<IStorageProvider>;

  beforeEach(async () => {
    mockStorageProvider = {
      generatePresignedUploadUrl: jest.fn().mockResolvedValue('https://presigned-url.test'),
      getPublicUrl: jest.fn((key: string) => `https://public-cdn.test/${key}`),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: STORAGE_PROVIDER,
          useValue: mockStorageProvider,
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  it('should generate original presigned url for event-cover', async () => {
    const result = await service.getPresignedUploadUrl('user-123', {
      type: 'event-cover',
      contentType: 'image/jpeg',
    });

    expect(result.original).toBeDefined();
    expect(result.original.uploadUrl).toBe('https://presigned-url.test');
    expect(result.original.publicUrl).toContain('https://public-cdn.test/event-cover/user-123-');
    expect(result.thumbnail).toBeUndefined();
    expect(mockStorageProvider.generatePresignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('should generate thumbnail and original for avatar', async () => {
    const result = await service.getPresignedUploadUrl('user-456', {
      type: 'avatar',
      contentType: 'image/png',
    });

    expect(result.original).toBeDefined();
    expect(result.thumbnail).toBeDefined();
    expect(result.thumbnail.publicUrl).toContain('-thumb.png');
    expect(mockStorageProvider.generatePresignedUploadUrl).toHaveBeenCalledTimes(2);
  });
});
