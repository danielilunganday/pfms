import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Button, Input, Label } from '../components/ui';

interface Setting { key: string; value: string; description: string | null }

const FRIENDLY_LABELS: Record<string, string> = {
  default_loan_interest_rate_percent: 'Default loan interest rate (%)',
  loan_compounding_period: 'Loan compounding period',
  budget_warning_threshold_pct: 'Budget warning threshold (%)',
  budget_critical_threshold_pct: 'Budget over-budget threshold (%)',
  emergency_fund_target_months: 'Emergency fund target (months)',
  sms_reminder_days_before_due: 'SMS reminder — days before due date',
  sms_reminder_overdue_repeat_days: 'SMS reminder — repeat every N days overdue',
  primary_currency: 'Primary currency (for Net Worth & reports)',
};

export function Settings() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Setting[]>('/settings') });
  const [edits, setEdits] = useState<Record<string, string>>({});

  const saveSetting = useMutation({
    mutationFn: (key: string) => api.put(`/settings/${key}`, { value: edits[key] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const interestRateSetting = settings?.find((s) => s.key === 'default_loan_interest_rate_percent');
  const otherSettings = settings?.filter((s) => s.key !== 'default_loan_interest_rate_percent') ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-[var(--text-secondary)]">System configuration — change anything here at your discretion.</p>
      </div>

      {interestRateSetting && (
        <Card title="Loan interest rate">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            This is the rate pre-filled whenever you give a new loan. It's fully editable — change it here any time,
            or override it on an individual loan from the Lending page. Changing this default does not affect loans
            already given; each loan keeps its own rate.
          </p>
          <div className="flex items-end gap-3">
            <div>
              <Label>Current default</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  className="w-28"
                  value={edits[interestRateSetting.key] ?? interestRateSetting.value}
                  onChange={(e) => setEdits({ ...edits, [interestRateSetting.key]: e.target.value })}
                />
                <span className="text-sm text-[var(--text-secondary)]">%</span>
              </div>
            </div>
            <Button
              onClick={() => saveSetting.mutate(interestRateSetting.key)}
              disabled={saveSetting.isPending || !edits[interestRateSetting.key]}
            >
              {saveSetting.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Card>
      )}

      <Card title="Other system settings">
        <div className="space-y-4">
          {otherSettings.map((s) => (
            <div key={s.key} className="flex items-end justify-between gap-3 border-b border-[var(--border)] pb-3 last:border-0">
              <div className="flex-1">
                <Label>{FRIENDLY_LABELS[s.key] ?? s.key}</Label>
                <Input
                  value={edits[s.key] ?? s.value}
                  onChange={(e) => setEdits({ ...edits, [s.key]: e.target.value })}
                />
                {s.description && <p className="mt-1 text-xs text-[var(--muted)]">{s.description}</p>}
              </div>
              <Button variant="secondary" onClick={() => saveSetting.mutate(s.key)} disabled={saveSetting.isPending || !edits[s.key]}>
                Save
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="About this system">
        <p className="text-sm text-[var(--text-secondary)]">
          Personal Financial Management &amp; Wealth Control System — a transaction-based ledger with configurable
          categories, accounts, budgets, savings goals, investments, a lending module with compounding interest and
          SMS reminders, and consolidated net worth across USD and ZIG. Every calculated figure is derived from the
          underlying transaction tables — nothing here is a manually maintained total.
        </p>
      </Card>
    </div>
  );
}
