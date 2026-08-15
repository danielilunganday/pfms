import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('monthly-summary')
  monthly(@Query('period') period: string, @Query('currency') currency: string) {
    return this.analytics.monthlySummary(period, currency);
  }

  @Get('annual-summary')
  annual(@Query('year') year: string, @Query('currency') currency: string) {
    return this.analytics.annualSummary(parseInt(year, 10), currency);
  }

  @Get('category-breakdown')
  breakdown(
    @Query('period') period: string,
    @Query('currency') currency: string,
    @Query('type') type?: 'INCOME' | 'EXPENSE',
  ) {
    return this.analytics.categoryBreakdown(period, currency, type ?? 'EXPENSE');
  }

  @Get('emergency-fund')
  emergencyFund(@Query('currency') currency: string, @Query('trailingMonths') trailingMonths?: string) {
    return this.analytics.emergencyFundCoverage(currency, trailingMonths ? parseInt(trailingMonths, 10) : 3);
  }

  @Get('forecast')
  forecast(@Query('currency') currency: string, @Query('trailingMonths') trailingMonths?: string) {
    return this.analytics.forecastAnnual(currency, trailingMonths ? parseInt(trailingMonths, 10) : 3);
  }

  @Get('monthly-trend')
  monthlyTrend(@Query('currency') currency: string, @Query('months') months?: string) {
    return this.analytics.monthlyTrend(currency, months ? parseInt(months, 10) : 12);
  }

  @Get('category-monthly-trend')
  categoryMonthlyTrend(
    @Query('currency') currency: string,
    @Query('months') months?: string,
    @Query('type') type?: 'INCOME' | 'EXPENSE',
  ) {
    return this.analytics.categoryMonthlyTrend(currency, months ? parseInt(months, 10) : 12, type ?? 'EXPENSE');
  }

  @Get('insights')
  insights(@Query('currency') currency: string, @Query('months') months?: string) {
    return this.analytics.insights(currency, months ? parseInt(months, 10) : 6);
  }
}
