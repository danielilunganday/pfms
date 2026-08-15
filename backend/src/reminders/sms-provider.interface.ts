// Pluggable SMS sending — swap providers without touching business logic.
export const SMS_PROVIDER = 'SMS_PROVIDER';

export interface SmsSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface SmsProvider {
  send(toPhoneNumber: string, message: string): Promise<SmsSendResult>;
}
