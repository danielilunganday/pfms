import Decimal from 'decimal.js';
import { sumConvertedAmounts, computeNetWorthTotals } from './net-worth-math';

describe('sumConvertedAmounts', () => {
  it('sums converted amounts and ignores nothing when everything converts', () => {
    const { total, unconverted } = sumConvertedAmounts([
      { source: 'cash', currency: 'USD', amount: '100', converted: new Decimal(100) },
      { source: 'cash', currency: 'USD', amount: '50', converted: new Decimal(50) },
    ]);
    expect(total.toFixed(2)).toBe('150.00');
    expect(unconverted).toHaveLength(0);
  });

  it('excludes unconverted entries from the total and lists them separately, instead of assuming a 1:1 rate', () => {
    const { total, unconverted } = sumConvertedAmounts([
      { source: 'cash', currency: 'USD', amount: '100', converted: new Decimal(100) },
      { source: 'cash', currency: 'ZIG', amount: '5000', converted: null },
    ]);
    expect(total.toFixed(2)).toBe('100.00');
    expect(unconverted).toEqual([{ source: 'cash', currency: 'ZIG', amount: '5000' }]);
  });

  it('returns zero total with no entries', () => {
    const { total, unconverted } = sumConvertedAmounts([]);
    expect(total.toFixed(2)).toBe('0.00');
    expect(unconverted).toHaveLength(0);
  });
});

describe('computeNetWorthTotals', () => {
  it('adds the three asset buckets and subtracts liabilities', () => {
    const r = computeNetWorthTotals({ liquidAssets: '1000', investmentsValue: '500', receivablesValue: '200', totalLiabilities: '300' });
    expect(r.totalAssets).toBe('1700.00');
    expect(r.netWorth).toBe('1400.00');
  });

  it('allows net worth to go negative when liabilities exceed assets', () => {
    const r = computeNetWorthTotals({ liquidAssets: '100', investmentsValue: '0', receivablesValue: '0', totalLiabilities: '500' });
    expect(r.netWorth).toBe('-400.00');
  });

  it('handles all-zero parts', () => {
    const r = computeNetWorthTotals({ liquidAssets: '0', investmentsValue: '0', receivablesValue: '0', totalLiabilities: '0' });
    expect(r.totalAssets).toBe('0.00');
    expect(r.netWorth).toBe('0.00');
  });
});
