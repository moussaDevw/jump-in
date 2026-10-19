export interface OAuthUserProfile {
  providerId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface IOAuthProviderStrategy {
  readonly provider: string;
  verifyToken(
    idToken: string,
    fallbackInfo?: { firstName?: string; lastName?: string },
  ): Promise<OAuthUserProfile>;
}
