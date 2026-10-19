import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class CodeGeneratorService {
  /**
   * Generates a random alphanumeric slug of the given length.
   */
  generateSlug(length = 10): string {
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let slug = '';
    for (let i = 0; i < length; i++) {
      slug += chars[crypto.randomInt(0, chars.length)];
    }
    return slug;
  }

  /**
   * Generates a unique 8-character alphanumeric ticket code.
   * Excludes ambiguous characters (0, O, 1, I) for readability on physical screens.
   */
  generateTicketCode(length = 8): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars[crypto.randomInt(0, chars.length)];
    }
    return code;
  }
}
