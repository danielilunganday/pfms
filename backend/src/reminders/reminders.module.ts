import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';
import { ConsoleSmsProvider } from './console-sms.provider';
import { AfricasTalkingSmsProvider } from './africas-talking-sms.provider';
import { TwilioSmsProvider } from './twilio-sms.provider';
import { SMS_PROVIDER } from './sms-provider.interface';
import { LendingModule } from '../lending/lending.module';
import { SettingsModule } from '../settings/settings.module';

/**
 * The active SMS provider is chosen at startup from the SMS_PROVIDER env var
 * (CONSOLE | AFRICAS_TALKING | TWILIO), defaulting to the safe console stub.
 * See docs/DEPLOYMENT_GUIDE.md for switching to a real provider — nothing
 * else in the app needs to change, everything talks to the SmsProvider
 * interface via the SMS_PROVIDER token.
 */
@Module({
  imports: [LendingModule, SettingsModule],
  providers: [
    RemindersService,
    ConsoleSmsProvider,
    AfricasTalkingSmsProvider,
    TwilioSmsProvider,
    {
      provide: SMS_PROVIDER,
      useFactory: (console: ConsoleSmsProvider, at: AfricasTalkingSmsProvider, twilio: TwilioSmsProvider) => {
        switch ((process.env.SMS_PROVIDER || 'CONSOLE').toUpperCase()) {
          case 'AFRICAS_TALKING':
            return at;
          case 'TWILIO':
            return twilio;
          default:
            return console;
        }
      },
      inject: [ConsoleSmsProvider, AfricasTalkingSmsProvider, TwilioSmsProvider],
    },
  ],
  controllers: [RemindersController],
  exports: [RemindersService],
})
export class RemindersModule {}
