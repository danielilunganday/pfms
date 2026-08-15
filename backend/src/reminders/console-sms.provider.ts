import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider, SmsSendResult } from './sms-provider.interface';

/**
 * Default provider — logs the message instead of sending a real SMS.
 * Active until you configure a real provider (see AfricasTalkingSmsProvider).
 * This lets the whole reminder pipeline be built and tested end-to-end
 * without needing a funded SMS account yet.
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SMS[console-stub]');

  async send(toPhoneNumber: string, message: string): Promise<SmsSendResult> {
    this.logger.log(`Would send SMS to ${toPhoneNumber}: "${message}"`);
    return { success: true, providerMessageId: `console-${Date.now()}` };
  }
}
