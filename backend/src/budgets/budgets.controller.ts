import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BudgetsService } from './budgets.service';

@UseGuards(JwtAuthGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Post()
  setBudget(@Body() body: any) {
    return this.budgets.setBudget(body);
  }

  @Get()
  list(@Query('period') period?: string) {
    return this.budgets.listBudgets(period);
  }

  @Get('vs-actual')
  vsActual(@Query('period') period: string, @Query('currency') currency: string) {
    return this.budgets.budgetVsActual(period, currency);
  }

  @Post('overall')
  setOverall(@Body() body: any) {
    return this.budgets.setOverallBudget(body);
  }

  @Get('overall/vs-actual')
  overallVsActual(@Query('period') period: string, @Query('currency') currency: string) {
    return this.budgets.overallBudgetVsActual(period, currency);
  }
}
