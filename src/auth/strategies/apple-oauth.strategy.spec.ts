import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppleOAuthStrategy } from './apple-oauth.strategy';
import { UnauthorizedException } from '@nestjs/common';

describe('AppleOAuthStrategy', () => {
  let strategy: AppleOAuthStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppleOAuthStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'APPLE_CLIENT_ID') return 'com.jumpin.app.test';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    strategy = module.get<AppleOAuthStrategy>(AppleOAuthStrategy);
  });

  it('should have provider name as "apple"', () => {
    expect(strategy.provider).toBe('apple');
  });

  it('should throw UnauthorizedException on invalid token', async () => {
    await expect(strategy.verifyToken('invalid-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
