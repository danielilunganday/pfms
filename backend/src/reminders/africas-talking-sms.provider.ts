import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider, SmsSendResult } from './sms-provider.interface';

/**
 * Real SMS delivery via Africa's Talking (strong Zimbabwe coverage/pricing).
 * INACTIVE until you set AT_API_KEY and AT_USERNAME in the backend's .env —
 * see /docs/deployment-guide.md for account setup steps. Not wired into
 * RemindersModule by default; swap it in for ConsoleSmsProvider once your
 * account is funded and tested.
 */
@Injectable()
export class AfricasTalkingSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SMS[africas-talking]');

  async send(toPhoneNumber: string, message: string): Promise<SmsSendResult> {
    const apiKey = process.env.AT_API_KEY;
    const username = process.env.AT_USERNAME;
    if (!apiKey || !username) {
      this.logger.warn(
        'AT_API_KEY / AT_USERNAME not configured — cannot send a real SMS. ' +
          'Falling back to logging only. See /docs/deployment-guide.md.',
      );
      this.logger.log(`Would send SMS to ${toPhoneNumber}: "${message}"`);
      return { success: false, error: 'SMS provider not configured' };
    }

    try {
      const res = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ username, to: toPhoneNumber, message }).toString(),
      });
      const body = await res.json();
      if (!res.ok) return { success: false, error: JSON.stringify(body) };
      return { success: true, providerMessageId: JSON.stringify(body) };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Unknown SMS send error' };
    }
  }
}
