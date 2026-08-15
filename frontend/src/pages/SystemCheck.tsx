import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Button, StatusBadge } from '../components/ui';

interface CheckResult { code: string; level: 'OK' | 'WARNING' | 'ERROR'; message: string; count?: number }
interface CheckReport { results: CheckResult[]; summary: { ok: number; warning: number; error: number }; runAt: string }

export function SystemCheck() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['system-check'],
    queryFn: () => api.get<CheckReport>('/system-check'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">System check</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            A transparency report on the system itself — every check here inspects a real invariant (a broken transfer
            pairing, a loan that's gone quiet on interest, a stale recurring bill) and tells you exactly what to do
            about it. Nothing here is a hidden score.
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Checking…' : 'Run again'}</Button>
      </div>

      {isLoading && <p className="text-sm text-[var(--muted)]">Running checks…</p>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="text-center">
              <div className="text-2xl font-semibold text-[var(--good)]">{data.summary.ok}</div>
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">OK</div>
            </Card>
            <Card className="text-center">
              <div className="text-2xl font-semibold text-[var(--warning)]">{data.summary.warning}</div>
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Warning</div>
            </Card>
            <Card className="text-center">
              <div className="text-2xl font-semibold text-[var(--critical)]">{data.summary.error}</div>
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Error</div>
            </Card>
          </div>

          <Card title={`Checks — run at ${new Date(data.runAt).toLocaleString()}`}>
            <ul className="divide-y divide-[var(--border)]">
              {data.results.map((r) => (
                <li key={r.code} className="flex items-start justify-between gap-4 py-3">
                  <p className="text-sm text-[var(--text-primary)]">{r.message}</p>
                  <StatusBadge status={r.level} label={r.level === 'OK' ? 'OK' : r.level === 'WARNING' ? 'Warning' : 'Error'} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
