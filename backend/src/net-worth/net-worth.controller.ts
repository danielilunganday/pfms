import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NetWorthService } from './net-worth.service';
import { FxService } from './fx.service';

@UseGuards(JwtAuthGuard)
@Controller('net-worth')
export class NetWorthController {
  constructor(
    private readonly netWorth: NetWorthService,
    private readonly fx: FxService,
  ) {}

  @Get()
  compute() {
    return this.netWorth.compute();
  }

  @Post('snapshot')
  snapshot() {
    return this.netWorth.saveSnapshot();
  }

  @Get('history')
  history() {
    return this.netWorth.history();
  }

  @Post('exchange-rates')
  setRate(@Body() body: { date: string; fromCurrency: string; toCurrency: string; rate: string; source?: string }) {
    return this.fx.setRate(body.date, body.fromCurrency, body.toCurrency, body.rate, body.source);
  }

  @Get('exchange-rates')
  listRates() {
    return this.fx.listRates();
  }
}
