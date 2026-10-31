import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { Device } from '@prisma/client';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registers or updates a device push token for a given user.
   * If the token already existed on another account or was revoked, it re-binds to this user and un-revokes.
   */
  async registerDevice(userId: string, dto: RegisterDeviceDto): Promise<Device> {
    const { pushToken, platform, locale } = dto;

    if (locale) {
      await this.prisma.user
        .update({
          where: { id: userId },
          data: { locale },
        })
        .catch((e) => this.logger.warn(`Could not update user locale: ${e.message}`));
    }

    const device = await this.prisma.device.upsert({
      where: { pushToken },
      update: {
        userId,
        platform,
        revokedAt: null,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        pushToken,
        platform,
        revokedAt: null,
        lastSeenAt: new Date(),
      },
    });

    this.logger.log(`Device registered for user ${userId} [platform=${platform}]`);
    return device;
  }

  /**
   * Marks a specific push token as revoked when a user logs out or disables push notifications.
   */
  async revokeDevice(userId: string, pushToken: string): Promise<void> {
    await this.prisma.device.updateMany({
      where: {
        userId,
        pushToken,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    this.logger.log(`Device revoked for user ${userId} [token=${pushToken.slice(0, 15)}...]`);
  }

  /**
   * Retrieves active (non-revoked) devices for a given user.
   */
  async getActiveDevicesForUser(userId: string): Promise<Device[]> {
    return this.prisma.device.findMany({
      where: {
        userId,
        revokedAt: null,
      },
    });
  }

  /**
   * Retrieves active (non-revoked) devices for multiple users in a single query.
   */
  async getActiveDevicesForUsers(userIds: string[]): Promise<Device[]> {
    if (!userIds.length) return [];
    return this.prisma.device.findMany({
      where: {
        userId: { in: userIds },
        revokedAt: null,
      },
    });
  }

  /**
   * Revokes a list of invalid or unregistered tokens (detected by Expo Push tickets/receipts).
   */
  async markTokensAsRevoked(tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    await this.prisma.device.updateMany({
      where: {
        pushToken: { in: tokens },
      },
      data: {
        revokedAt: new Date(),
      },
    });
    this.logger.warn(`Revoked ${tokens.length} invalid/unregistered push tokens`);
  }
}
