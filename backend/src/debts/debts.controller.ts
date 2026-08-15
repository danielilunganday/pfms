import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DebtsService } from './debts.service';

@UseGuards(JwtAuthGuard)
@Controller('debts')
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  @Post()
  create(@Body() body: any) {
    return this.debts.create(body);
  }

  @Get()
  list() {
    return this.debts.list();
  }

  @Get('summary/outstanding-by-currency')
  outstanding() {
    return this.debts.totalOutstandingByCurrency();
  }

  @Post(':id/payments')
  pay(@Param('id') id: string, @Body() body: { amount: string }) {
    return this.debts.recordPayment(id, body.amount);
  }
}
