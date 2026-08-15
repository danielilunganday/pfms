import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RemindersService } from './reminders.service';

@UseGuards(JwtAuthGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(@Query('loanId') loanId?: string) {
    return this.reminders.list(loanId);
  }

  @Post('run-daily-job')
  runDailyJob() {
    return this.reminders.runDailyJob();
  }

  @Post('dispatch-due')
  dispatchDue() {
    return this.reminders.dispatchDueReminders();
  }
}
