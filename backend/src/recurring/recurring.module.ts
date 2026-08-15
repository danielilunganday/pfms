import { Module } from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { RecurringController } from './recurring.controller';

@Module({
  providers: [RecurringService],
  controllers: [RecurringController],
  exports: [RecurringService],
})
export class RecurringModule {}
