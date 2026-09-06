export class UserSummaryDto {
  id: string;
  email: string | null;
  username: string | null;
  firstName?: string | null;
  lastName?: string | null;
  onboardingCompleted: boolean;
}

export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: UserSummaryDto;
}
