import { computeGoalProjection } from './goal-projection';

describe('computeGoalProjection', () => {
  it('with no contributions yet, has no projection but correct remaining/progress', () => {
    const r = computeGoalProjection({
      targetAmount: '1000',
      currentAmount: '0',
      contributionDates: [],
      now: '2026-01-01',
    });
    expect(r.remainingStr).toBe('1000.00');
    expect(r.progressPct).toBe('0.0');
    expect(r.projectedCompletionDate).toBeNull();
    expect(r.onTrack).toBeNull();
  });

  it('is complete (remaining 0) once current meets or exceeds target', () => {
    const r = computeGoalProjection({
      targetAmount: '1000',
      currentAmount: '1200',
      contributionDates: ['2026-01-01'],
      now: '2026-02-01',
    });
    expect(r.remainingStr).toBe('0.00');
    expect(r.progressPct).toBe('120.0');
  });

  it('projects a completion date and reports onTrack when the rate beats the target date', () => {
    // Contributed 300 over 3 months elapsed => 100/month average. Remaining 700 => 7 more months.
    const r = computeGoalProjection({
      targetAmount: '1000',
      currentAmount: '300',
      contributionDates: ['2026-01-01', '2026-02-01', '2026-03-01'],
      targetDate: '2027-01-01', // ~10 months away from "now" — plenty of room
      now: '2026-04-01',
    });
    expect(r.projectedCompletionDate).not.toBeNull();
    expect(r.onTrack).toBe(true);
  });

  it('reports onTrack=false when the projected date is after the target date', () => {
    // Same contribution rate as above, but a much tighter target date.
    const r = computeGoalProjection({
      targetAmount: '1000',
      currentAmount: '300',
      contributionDates: ['2026-01-01', '2026-02-01', '2026-03-01'],
      targetDate: '2026-05-01', // only 1 month away — the ~7-month projection blows past it
      now: '2026-04-01',
    });
    expect(r.onTrack).toBe(false);
  });

  it('leaves onTrack null when no targetDate was set, even with a valid projection', () => {
    const r = computeGoalProjection({
      targetAmount: '1000',
      currentAmount: '300',
      contributionDates: ['2026-01-01', '2026-02-01', '2026-03-01'],
      now: '2026-04-01',
    });
    expect(r.projectedCompletionDate).not.toBeNull();
    expect(r.onTrack).toBeNull();
  });

  it('handles a zero target amount without dividing by zero', () => {
    const r = computeGoalProjection({
      targetAmount: '0',
      currentAmount: '0',
      contributionDates: [],
      now: '2026-01-01',
    });
    expect(r.progressPct).toBe('0.0');
    expect(r.remainingStr).toBe('0.00');
  });
});
