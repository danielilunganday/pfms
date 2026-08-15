import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SavingsGoalsService } from './savings-goals.service';

@UseGuards(JwtAuthGuard)
@Controller('savings-goals')
export class SavingsGoalsController {
  constructor(private readonly goals: SavingsGoalsService) {}

  @Post()
  create(@Body() body: any) {
    return this.goals.create(body);
  }

  @Get()
  list() {
    return this.goals.list();
  }

  @Get(':id/progress')
  progress(@Param('id') id: string) {
    return this.goals.progress(id);
  }

  @Post(':id/contribute')
  contribute(@Param('id') id: string, @Body() body: { amount: string; date: string; transactionId?: string }) {
    return this.goals.contribute(id, body.amount, body.date, body.transactionId);
  }
}
