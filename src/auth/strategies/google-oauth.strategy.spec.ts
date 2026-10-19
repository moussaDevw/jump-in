import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleOAuthStrategy } from './google-oauth.strategy';
import { UnauthorizedException } from '@nestjs/common';

describe('GoogleOAuthStrategy', () => {
  let strategy: GoogleOAuthStrategy;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuthStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GOOGLE_CLIENT_ID') return 'google-client-id-test';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    strategy = module.get<GoogleOAuthStrategy>(GoogleOAuthStrategy);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should have provider name as "google"', () => {
    expect(strategy.provider).toBe('google');
  });

  it('should throw UnauthorizedException on invalid token', async () => {
    await expect(strategy.verifyToken('invalid-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
