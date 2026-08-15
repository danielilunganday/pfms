import { Inject, Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { netWorthSnapshots } from '../db/schema';
import { money, toDb } from '../common/money';
import { AccountsService } from '../accounts/accounts.service';
import { InvestmentsService } from '../investments/investments.service';
import { LendingService } from '../lending/lending.service';
import { DebtsService } from '../debts/debts.service';
import { SettingsService } from '../settings/settings.service';
import { FxService } from './fx.service';
import { sumConvertedAmounts, computeNetWorthTotals, ConversionOutcome } from './net-worth-math';

@Injectable()
export class NetWorthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly accounts: AccountsService,
    private readonly investments: InvestmentsService,
    private readonly lending: LendingService,
    private readonly debts: DebtsService,
    private readonly settings: SettingsService,
    private readonly fx: FxService,
  ) {}

  /**
   * Consolidated net worth in the primary currency (spec §16). Any currency
   * that has no configured exchange rate is reported separately under
   * `unconverted` rather than silently treated as 1:1 — this keeps the
   * headline number honest.
   */
  async compute(asOf: Date = new Date()) {
    const primary = await this.settings.get('primary_currency');
    const unconverted: { source: string; currency: string; amount: string }[] = [];

    const collect = async (source: string, byCurrency: Record<string, string>): Promise<ConversionOutcome[]> => {
      const outcomes: ConversionOutcome[] = [];
      for (const [currency, amountStr] of Object.entries(byCurrency)) {
        const { converted } = await this.fx.convert(money(amountStr), currency, primary, asOf);
        outcomes.push({ source, currency, amount: amountStr, converted });
      }
      return outcomes;
    };

    // Liquid assets = spendable cash accounts + savings accounts (still cash,
    // just held for a purpose). Kept distinct from investmentsValue below so
    // nothing is counted twice (spec §37).
    const cashByCurrency = await this.accounts.totalCashByCurrency();
    const savingsByCurrency = await this.accounts.totalSavingsAccountBalanceByCurrency();
    const liquidOutcomes = [...(await collect('cash', cashByCurrency)), ...(await collect('savings_account', savingsByCurrency))];
    const liquidResult = sumConvertedAmounts(liquidOutcomes);
    unconverted.push(...liquidResult.unconverted);

    const investmentList = await this.investments.list();
    const investmentOutcomes: ConversionOutcome[] = [];
    for (const inv of investmentList) {
      const { converted } = await this.fx.convert(money(inv.currentValue), inv.currency, primary, asOf);
      investmentOutcomes.push({ source: 'investment', currency: inv.currency, amount: inv.currentValue, converted });
    }

    // Cash sitting in an "Investment Account" (e.g. brokerage cash) — separate
    // from the tracked investment positions above, still not double-counted.
    const investmentAccountBalances = await this.accounts.totalInvestmentAccountBalanceByCurrency();
    investmentOutcomes.push(...(await collect('investment_account_cash', investmentAccountBalances)));
    const investmentResult = sumConvertedAmounts(investmentOutcomes);
    unconverted.push(...investmentResult.unconverted);

    const loanPortfolio = await this.lending.portfolioSummary();
    const receivableOutcomes: ConversionOutcome[] = [];
    for (const [currency, v] of Object.entries(loanPortfolio.byCurrency)) {
      const { converted } = await this.fx.convert(money((v as any).outstanding), currency, primary, asOf);
      receivableOutcomes.push({ source: 'loans_receivable', currency, amount: (v as any).outstanding, converted });
    }
    const receivablesResult = sumConvertedAmounts(receivableOutcomes);
    unconverted.push(...receivablesResult.unconverted);

    const debtsByCurrency = await this.debts.totalOutstandingByCurrency();
    const liabilityOutcomes = await collect('debts_payable', debtsByCurrency);
    const liabilitiesResult = sumConvertedAmounts(liabilityOutcomes);
    unconverted.push(...liabilitiesResult.unconverted);

    const totals = computeNetWorthTotals({
      liquidAssets: liquidResult.total,
      investmentsValue: investmentResult.total,
      receivablesValue: receivablesResult.total,
      totalLiabilities: liabilitiesResult.total,
    });

    return {
      asOf,
      currency: primary,
      liquidAssets: toDb(liquidResult.total),
      investmentsValue: toDb(investmentResult.total),
      receivablesValue: toDb(receivablesResult.total),
      totalAssets: totals.totalAssets,
      totalLiabilities: toDb(liabilitiesResult.total),
      netWorth: totals.netWorth,
      unconverted, // amounts in currencies with no configured exchange rate — not included above
    };
  }

  async saveSnapshot(asOf: Date = new Date()) {
    const result = await this.compute(asOf);
    const [row] = await this.db
      .insert(netWorthSnapshots)
      .values({
        date: asOf,
        totalAssets: result.totalAssets,
        totalLiabilities: result.totalLiabilities,
        netWorth: result.netWorth,
        liquidAssets: result.liquidAssets,
        investmentsValue: result.investmentsValue,
        receivablesValue: result.receivablesValue,
        currency: result.currency,
      })
      .onConflictDoNothing()
      .returning();
    return row ?? result;
  }

  history() {
    return this.db.select().from(netWorthSnapshots).orderBy(desc(netWorthSnapshots.date));
  }
}
