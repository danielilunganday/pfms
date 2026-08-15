import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RecurringService } from './recurring.service';

@UseGuards(JwtAuthGuard)
@Controller('recurring')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Post()
  create(@Body() body: any) {
    return this.recurring.create(body);
  }

  @Get()
  list(@Query('activeOnly') activeOnly?: string) {
    return this.recurring.list(activeOnly === 'true');
  }

  @Get('upcoming')
  upcoming(@Query('withinDays') withinDays?: string) {
    return this.recurring.upcoming(withinDays ? parseInt(withinDays, 10) : 14);
  }

  @Post('generate-due')
  generateDue() {
    return this.recurring.generateDue();
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.recurring.deactivate(id);
  }
}
