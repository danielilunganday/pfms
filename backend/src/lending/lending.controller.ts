import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LendingService } from './lending.service';

@UseGuards(JwtAuthGuard)
@Controller('lending')
export class LendingController {
  constructor(private readonly lending: LendingService) {}

  @Post('borrowers')
  createBorrower(@Body() body: any) {
    return this.lending.createBorrower(body);
  }

  @Get('borrowers')
  listBorrowers() {
    return this.lending.listBorrowers();
  }

  @Get('borrowers/:id')
  getBorrower(@Param('id') id: string) {
    return this.lending.getBorrower(id);
  }

  @Put('borrowers/:id')
  updateBorrower(@Param('id') id: string, @Body() body: any) {
    return this.lending.updateBorrower(id, body);
  }

  @Post('loans')
  createLoan(@Body() body: any) {
    return this.lending.createLoan(body);
  }

  @Get('loans')
  listLoans() {
    return this.lending.listLoans();
  }

  @Get('loans/:id')
  loanDetail(@Param('id') id: string) {
    return this.lending.loanDetail(id);
  }

  @Patch('loans/:id/interest-rate')
  setRate(@Param('id') id: string, @Body() body: { ratePercent: string }) {
    return this.lending.setLoanInterestRate(id, body.ratePercent);
  }

  @Patch('loans/:id/write-off')
  writeOff(@Param('id') id: string, @Body() body: { notes?: string }) {
    return this.lending.writeOff(id, body?.notes);
  }

  @Post('loans/:id/accrue')
  accrue(@Param('id') id: string, @Query('asOf') asOf?: string) {
    return this.lending.accrueDueInterest(id, asOf ? new Date(asOf) : undefined);
  }

  @Get('loans/:id/balance')
  async balance(@Param('id') id: string, @Query('asOf') asOf?: string) {
    const b = await this.lending.getOutstandingBalance(id, asOf ? new Date(asOf) : undefined);
    return { loanId: id, outstandingBalance: b.toFixed(2) };
  }

  @Post('loans/:id/repayments')
  repay(@Param('id') id: string, @Body() body: { amount: string; date: string }) {
    return this.lending.recordRepayment(id, body.amount, body.date);
  }

  @Get('loans/:id/reminders')
  reminders(@Param('id') id: string) {
    return this.lending.remindersForLoan(id);
  }

  @Get('portfolio-summary')
  portfolio() {
    return this.lending.portfolioSummary();
  }
}
