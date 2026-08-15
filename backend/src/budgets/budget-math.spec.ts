import { computeBudgetStatus } from './budget-math';

describe('computeBudgetStatus', () => {
  it('is OK well under the warning threshold', () => {
    const r = computeBudgetStatus('500', '100', '80', '100');
    expect(r.status).toBe('OK');
    expect(r.pctUsed).toBe('20.0');
    expect(r.remaining).toBe('400.00');
    expect(r.variance).toBe('400.00');
  });

  it('flips to WARNING exactly at the warning threshold', () => {
    const r = computeBudgetStatus('100', '80', '80', '100');
    expect(r.pctUsed).toBe('80.0');
    expect(r.status).toBe('WARNING');
  });

  it('is still WARNING just under 100%', () => {
    const r = computeBudgetStatus('100', '99.99', '80', '100');
    expect(r.status).toBe('WARNING');
  });

  it('flips to OVER exactly at the critical threshold', () => {
    const r = computeBudgetStatus('100', '100', '80', '100');
    expect(r.status).toBe('OVER');
    expect(r.remaining).toBe('0.00');
  });

  it('is OVER when spend exceeds the budget, with negative variance', () => {
    const r = computeBudgetStatus('100', '150', '80', '100');
    expect(r.status).toBe('OVER');
    expect(r.variance).toBe('-50.00');
    expect(r.remaining).toBe('0.00');
  });

  it('treats a zero budget with zero spend as OK, not a divide-by-zero crash', () => {
    const r = computeBudgetStatus('0', '0', '80', '100');
    expect(r.status).toBe('OK');
    expect(r.pctUsed).toBe('0.0');
  });

  it('treats a zero budget with any spend as OVER', () => {
    const r = computeBudgetStatus('0', '1', '80', '100');
    expect(r.status).toBe('OVER');
    expect(r.pctUsed).toBe('100.0');
  });

  it('respects custom thresholds (e.g. a stricter 50%/90% budget)', () => {
    const r = computeBudgetStatus('200', '110', '50', '90');
    expect(r.pctUsed).toBe('55.0');
    expect(r.status).toBe('WARNING');
  });
});
