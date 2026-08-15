import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InvestmentsService } from './investments.service';

@UseGuards(JwtAuthGuard)
@Controller('investments')
export class InvestmentsController {
  constructor(private readonly investments: InvestmentsService) {}

  @Post()
  create(@Body() body: any) {
    return this.investments.create(body);
  }

  @Get()
  list() {
    return this.investments.list();
  }

  @Get(':id/performance')
  performance(@Param('id') id: string) {
    return this.investments.performance(id);
  }

  @Post(':id/contribute')
  contribute(@Param('id') id: string, @Body() body: { amount: string; date: string }) {
    return this.investments.addContribution(id, body.amount, body.date);
  }

  @Post(':id/return')
  recordReturn(@Param('id') id: string, @Body() body: { amount: string; date: string }) {
    return this.investments.recordReturn(id, body.amount, body.date);
  }

  @Post(':id/withdraw')
  withdraw(@Param('id') id: string, @Body() body: { amount: string; date: string }) {
    return this.investments.recordWithdrawal(id, body.amount, body.date);
  }

  @Post(':id/mark-to-market')
  markToMarket(@Param('id') id: string, @Body() body: { currentValue: string }) {
    return this.investments.updateCurrentValue(id, body.currentValue);
  }
}
