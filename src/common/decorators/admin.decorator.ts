import { SetMetadata } from '@nestjs/common';

export const IS_ADMIN_KEY = 'isAdminOnly';
export const Admin = () => SetMetadata(IS_ADMIN_KEY, true);
