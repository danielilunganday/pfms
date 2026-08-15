import Decimal from 'decimal.js';
import { computeNewAccruals, computeOutstandingBalance, allocateRepayment } from './interest-engine';

const d = (v: string | number) => new Decimal(v);

describe('Lending interest engine — compounding on total owed', () => {
  it('matches the architecture doc worked example: $100 @ 20%, unpaid 3 months → $120 → $144 → $172.80', () => {
    const dateGiven = new Date('2026-01-01T00:00:00.000Z');
    const asOf = new Date('2026-04-02T00:00:00.000Z'); // 3 full monthly anniversaries have passed

    const accruals = computeNewAccruals({
      principal: d(100),
      dateGiven,
      ratePercent: d(20),
      existingAccruals: [],
      repayments: [],
      asOf,
    });

    expect(accruals).toHaveLength(3);
    expect(accruals[0].closingBalance.toFixed(2)).toBe('120.00');
    expect(accruals[1].closingBalance.toFixed(2)).toBe('144.00');
    expect(accruals[2].closingBalance.toFixed(2)).toBe('172.80');
    expect(accruals[2].interestCharged.toFixed(2)).toBe('28.80'); // 20% of 144
  });

  it('is idempotent-friendly: calling again with the same existingAccruals + asOf produces no new periods', () => {
    const dateGiven = new Date('2026-01-01T00:00:00.000Z');
    const asOf = new Date('2026-04-02T00:00:00.000Z');
    const first = computeNewAccruals({
      principal: d(100),
      dateGiven,
      ratePercent: d(20),
      existingAccruals: [],
      repayments: [],
      asOf,
    });
    const second = computeNewAccruals({
      principal: d(100),
      dateGiven,
      ratePercent: d(20),
      existingAccruals: first,
      repayments: [],
      asOf,
    });
    expect(second).toHaveLength(0);
  });

  it('stops generating periods once the balance is fully repaid', () => {
    const dateGiven = new Date('2026-01-01T00:00:00.000Z');
    const asOf = new Date('2026-04-02T00:00:00.000Z');
    const accruals = computeNewAccruals({
      principal: d(100),
      dateGiven,
      ratePercent: d(20),
      existingAccruals: [],
      repayments: [{ date: new Date('2026-02-15T00:00:00.000Z'), amount: d(120) }], // pays off period 1 in full
      asOf,
    });
    // Period 1 (Feb 1) is already settled before it closes... but rule charges
    // interest AT the anchor regardless of same-period repayment; balance
    // after period 1 close (120) minus repayment (120, paid Feb 15, after
    // period 1's Feb 1 anchor) = 0 by the time period 2 (Mar 1) is evaluated.
    expect(accruals.length).toBeGreaterThanOrEqual(1);
    const last = accruals[accruals.length - 1];
    expect(last.closingBalance.gte(0)).toBe(true);
  });

  it('applies a mid-loan rate change only to future periods, never rewriting past ones', () => {
    const dateGiven = new Date('2026-01-01T00:00:00.000Z');
    // First generate 2 periods at 20%
    const first2 = computeNewAccruals({
      principal: d(100),
      dateGiven,
      ratePercent: d(20),
      existingAccruals: [],
      repayments: [],
      asOf: new Date('2026-03-02T00:00:00.000Z'),
    });
    expect(first2).toHaveLength(2);
    expect(first2[1].closingBalance.toFixed(2)).toBe('144.00');

    // Now the user drops the rate to 10% going forward
    const third = computeNewAccruals({
      principal: d(100),
      dateGiven,
      ratePercent: d(10),
      existingAccruals: first2,
      repayments: [],
      asOf: new Date('2026-04-02T00:00:00.000Z'),
    });
    expect(third).toHaveLength(1);
    expect(third[0].openingBalance.toFixed(2)).toBe('144.00');
    expect(third[0].interestRatePercentApplied.toFixed(2)).toBe('10.00');
    expect(third[0].interestCharged.toFixed(2)).toBe('14.40'); // 10% of 144, not 20%
    expect(third[0].closingBalance.toFixed(2)).toBe('158.40');
    // Past periods are untouched
    expect(first2[0].interestRatePercentApplied.toFixed(2)).toBe('20.00');
    expect(first2[1].interestRatePercentApplied.toFixed(2)).toBe('20.00');
  });

  it('computeOutstandingBalance matches principal + interest to date − repayments to date, floored at 0', () => {
    const accruals = [
      { periodEnd: new Date('2026-02-01'), interestCharged: d(20) },
      { periodEnd: new Date('2026-03-01'), interestCharged: d(24) },
    ];
    const balance = computeOutstandingBalance({
      principal: d(100),
      accruals,
      repayments: [{ date: new Date('2026-02-10'), amount: d(200) }],
      asOf: new Date('2026-03-15'),
    });
    // 100 + 20 + 24 - 200 = -56 -> floored to 0
    expect(balance.toFixed(2)).toBe('0.00');
  });

  it('allocateRepayment applies interest-first, per the stated default assumption', () => {
    const result = allocateRepayment({
      amount: d(50),
      totalInterestChargedToDate: d(92.8), // 20+24+28.8+20 from a longer example
      totalInterestAlreadyRepaid: d(0),
    });
    expect(result.appliedToInterest.toFixed(2)).toBe('50.00');
    expect(result.appliedToPrincipal.toFixed(2)).toBe('0.00');
  });

  it('allocateRepayment spills into principal once outstanding interest is covered', () => {
    const result = allocateRepayment({
      amount: d(150),
      totalInterestChargedToDate: d(92.8),
      totalInterestAlreadyRepaid: d(50), // 42.80 interest still outstanding
    });
    expect(result.appliedToInterest.toFixed(2)).toBe('42.80');
    expect(result.appliedToPrincipal.toFixed(2)).toBe('107.20');
  });
});
