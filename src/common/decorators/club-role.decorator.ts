import { SetMetadata } from '@nestjs/common';
import { ClubRole } from '@prisma/client';

export const CLUB_ROLE_KEY = 'clubRole';
export const RequireClubRole = (role: ClubRole) => SetMetadata(CLUB_ROLE_KEY, role);
