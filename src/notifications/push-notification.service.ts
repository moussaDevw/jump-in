import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { DevicesService } from './devices.service';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly expo: Expo;

  constructor(private readonly devicesService: DevicesService) {
    this.expo = new Expo();
  }

  /**
   * Sends push notifications in optimized chunks via Expo Push Service.
   * Automatically validates token format and handles unregistered tokens.
   */
  async sendPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (!messages.length) return [];

    // Filter messages with valid Expo push tokens
    const validMessages: ExpoPushMessage[] = [];
    const invalidTokens: string[] = [];

    for (const message of messages) {
      const tokens = Array.isArray(message.to) ? message.to : [message.to];
      const validForMessage: string[] = [];

      for (const token of tokens) {
        if (Expo.isExpoPushToken(token)) {
          validForMessage.push(token);
        } else {
          this.logger.warn(`Invalid Expo push token format: ${token}`);
          invalidTokens.push(token);
        }
      }

      if (validForMessage.length > 0) {
        validMessages.push({
          ...message,
          to: validForMessage.length === 1 ? validForMessage[0] : validForMessage,
        });
      }
    }

    // Clean up invalid tokens from database asynchronously
    if (invalidTokens.length > 0) {
      this.devicesService.markTokensAsRevoked(invalidTokens).catch((err) => {
        this.logger.error('Failed to revoke invalid tokens', err);
      });
    }

    if (!validMessages.length) return [];

    const chunks = this.expo.chunkPushNotifications(validMessages);
    const tickets: ExpoPushTicket[] = [];
    const tokensToRevoke: string[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);

        // Inspect tickets for DeviceNotRegistered errors
        ticketChunk.forEach((ticket, index) => {
          if (ticket.status === 'error') {
            this.logger.warn(
              `Push notification ticket error: ${ticket.message} [code: ${ticket.details?.error}]`,
            );
            if (ticket.details?.error === 'DeviceNotRegistered') {
              const targetTo = chunk[index]?.to;
              if (typeof targetTo === 'string') {
                tokensToRevoke.push(targetTo);
              } else if (Array.isArray(targetTo)) {
                tokensToRevoke.push(...targetTo);
              }
            }
          }
        });
      } catch (error) {
        this.logger.error('Error sending push notification chunk via Expo', error);
      }
    }

    // Revoke unregistered tokens in database
    if (tokensToRevoke.length > 0) {
      this.devicesService.markTokensAsRevoked(tokensToRevoke).catch((err) => {
        this.logger.error('Failed to revoke unregistered tokens', err);
      });
    }

    return tickets;
  }
}
