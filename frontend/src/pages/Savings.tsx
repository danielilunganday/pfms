import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Button, Input, Label, Select, StatusBadge } from '../components/ui';
import { fmtMoney, todayIso } from '../lib/format';

interface GoalProgress {
  goalId: string; name: string; goalType: string | null; currency: string;
  targetAmountStr: string; currentAmountStr: string; remainingStr: string; progressPct: string;
  projectedCompletionDate: string | null; onTrack: boolean | null; status: string;
}

export function Savings() {
  const qc = useQueryClient();
  const { data: goals } = useQuery({ queryKey: ['savings-goals'], queryFn: () => api.get<GoalProgress[]>('/savings-goals') });
  const { data: goalTypes } = useQuery({
    queryKey: ['config', 'GOAL_TYPE'],
    queryFn: () => api.get<{ id: string; value: string }[]>('/settings/config-options?listType=GOAL_TYPE'),
  });

  const [form, setForm] = useState({ name: '', goalType: '', targetAmount: '', currency: 'USD', targetDate: '', monthlyTarget: '' });
  const create = useMutation({
    mutationFn: () => api.post('/savings-goals', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['savings-goals'] }); setForm({ ...form, name: '', targetAmount: '' }); },
  });

  const [contribution, setContribution] = useState<Record<string, string>>({});
  const contribute = useMutation({
    mutationFn: (goalId: string) => api.post(`/savings-goals/${goalId}/contribute`, { amount: contribution[goalId], date: todayIso() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings-goals'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Savings goals</h1>
        <p className="text-sm text-[var(--text-secondary)]">Intentional allocations — emergency fund, wedding, land, and more.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {goals?.map((g) => (
            <Card key={g.goalId}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-[var(--muted)]">{g.goalType ?? 'General'}</div>
                </div>
                <StatusBadge status={g.status} />
              </div>
              <div className="mb-1 flex justify-between text-sm tabular-nums">
                <span>{fmtMoney(g.currentAmountStr, g.currency)} of {fmtMoney(g.targetAmountStr, g.currency)}</span>
                <span>{g.progressPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                <div className="h-full bg-[var(--brand)]" style={{ width: `${Math.min(100, parseFloat(g.progressPct))}%` }} />
              </div>
              {g.projectedCompletionDate && (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Projected completion: {g.projectedCompletionDate} {g.onTrack === false && <span className="text-[var(--critical)]">— behind target date</span>}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Contribute amount"
                  value={contribution[g.goalId] ?? ''}
                  onChange={(e) => setContribution({ ...contribution, [g.goalId]: e.target.value })}
                />
                <Button variant="secondary" onClick={() => contribute.mutate(g.goalId)} disabled={!contribution[g.goalId]}>
                  Add
                </Button>
              </div>
            </Card>
          ))}
          {goals?.length === 0 && <Card><p className="text-sm text-[var(--muted)]">No savings goals yet.</p></Card>}
        </div>

        <Card title="New savings goal">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><Label>Type</Label>
              <Select value={form.goalType} onChange={(e) => setForm({ ...form, goalType: e.target.value })}>
                <option value="">—</option>
                {goalTypes?.map((t) => <option key={t.id} value={t.value}>{t.value}</option>)}
              </Select>
            </div>
            <div><Label>Target amount</Label><Input type="number" step="0.01" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} required /></div>
            <div><Label>Target date (optional)</Label><Input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></div>
            <div><Label>Monthly target (optional)</Label><Input type="number" step="0.01" value={form.monthlyTarget} onChange={(e) => setForm({ ...form, monthlyTarget: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={create.isPending}>Create goal</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
