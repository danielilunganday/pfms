import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountsService } from './accounts.service';

@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  create(@Body() body: any) {
    return this.accounts.create(body);
  }

  @Get()
  list() {
    return this.accounts.list();
  }

  @Get('summary/cash-by-currency')
  cashByCurrency() {
    return this.accounts.totalCashByCurrency();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.accounts.get(id);
  }

  @Get(':id/balance')
  async balance(@Param('id') id: string) {
    const b = await this.accounts.getBalance(id);
    return { accountId: id, balance: b.toFixed(2) };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.accounts.update(id, body);
  }
}
