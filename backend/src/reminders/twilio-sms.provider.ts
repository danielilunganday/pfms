import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider, SmsSendResult } from './sms-provider.interface';

/**
 * Real SMS delivery via Twilio — alternative to AfricasTalkingSmsProvider,
 * for accounts/regions better served by Twilio's coverage. INACTIVE unless
 * SMS_PROVIDER=TWILIO and TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_FROM_NUMBER are all set — see docs/DEPLOYMENT_GUIDE.md.
 */
@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SMS[twilio]');

  async send(toPhoneNumber: string, message: string): Promise<SmsSendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    if (!accountSid || !authToken || !fromNumber) {
      this.logger.warn(
        'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER not fully configured — cannot send a real SMS. ' +
          'Falling back to logging only. See docs/DEPLOYMENT_GUIDE.md.',
      );
      this.logger.log(`Would send SMS to ${toPhoneNumber}: "${message}"`);
      return { success: false, error: 'SMS provider not configured' };
    }

    try {
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: fromNumber, To: toPhoneNumber, Body: message }).toString(),
      });
      const body = await res.json();
      if (!res.ok) return { success: false, error: JSON.stringify(body) };
      return { success: true, providerMessageId: body.sid };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Unknown SMS send error' };
    }
  }
}
