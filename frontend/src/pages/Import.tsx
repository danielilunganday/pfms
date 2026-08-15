import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthToken } from '../lib/api';
import { Card, Button, Table } from '../components/ui';
import { fmtMoney } from '../lib/format';

interface ParsedRow {
  type?: 'INCOME' | 'EXPENSE';
  date?: string;
  accountId?: string;
  accountName?: string;
  categoryId?: string;
  categoryName?: string;
  currency?: string;
  amount?: string;
  description?: string;
  paymentMethod?: string;
  isEssential?: boolean;
}
interface ImportRow { rowNumber: number; raw: Record<string, string>; parsed: ParsedRow; errors: string[] }
interface PreviewResult { rows: ImportRow[]; summary: { total: number; valid: number; invalid: number } }

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function Import() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<{ createdCount: number; failedCount: number } | null>(null);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a CSV file first');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE_URL}/import/transactions/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        body: form,
      });
      if (!res.ok) throw new Error('Preview failed — is the file a valid CSV?');
      return res.json() as Promise<PreviewResult>;
    },
    onSuccess: (data) => { setPreview(data); setCommitResult(null); },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const validRows = (preview?.rows ?? []).filter((r) => r.errors.length === 0).map((r) => r.parsed);
      const res = await fetch(`${BASE_URL}/import/transactions/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ rows: validRows }),
      });
      if (!res.ok) throw new Error('Import failed');
      return res.json() as Promise<{ createdCount: number; failedCount: number }>;
    },
    onSuccess: (data) => { setCommitResult(data); setPreview(null); setFile(null); qc.invalidateQueries(); },
  });

  const validCount = preview?.rows.filter((r) => r.errors.length === 0).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import transactions</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Bring in years of historical income and expenses from a CSV export, instead of entering them one at a time.
        </p>
      </div>

      <Card title="1. Choose a CSV file">
        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          Columns (any order, case-insensitive): <code>date, type, account, category, amount, currency, description, paymentMethod, essential</code>.
          <br />
          <code>type</code> is INCOME or EXPENSE. <code>account</code> must match an existing account name exactly. <code>category</code> is optional —
          unmatched or blank falls back to Uncategorized. Transfers aren't supported by import; record those manually.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setCommitResult(null); }}
            className="text-sm"
          />
          <Button onClick={() => previewMutation.mutate()} disabled={!file || previewMutation.isPending}>
            {previewMutation.isPending ? 'Reading…' : 'Preview'}
          </Button>
        </div>
        {previewMutation.isError && <p className="mt-2 text-sm text-[var(--critical)]">{(previewMutation.error as Error).message}</p>}
      </Card>

      {preview && (
        <Card title={`2. Review — ${preview.summary.valid} of ${preview.summary.total} rows ready to import`}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              Rows with errors are skipped automatically. Fix the source CSV and re-upload to include them.
            </p>
            <Button onClick={() => commitMutation.mutate()} disabled={validCount === 0 || commitMutation.isPending}>
              {commitMutation.isPending ? 'Importing…' : `Import ${validCount} row(s)`}
            </Button>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            <Table headers={['Row', 'Date', 'Type', 'Account', 'Category', 'Amount', 'Issue']}>
              {preview.rows.map((r) => (
                <tr key={r.rowNumber} className={r.errors.length > 0 ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                  <td className="py-2 pr-4 text-[var(--muted)]">{r.rowNumber}</td>
                  <td className="py-2 pr-4">{r.parsed.date ?? '—'}</td>
                  <td className="py-2 pr-4">{r.parsed.type ?? '—'}</td>
                  <td className="py-2 pr-4">{r.parsed.accountName ?? '—'}</td>
                  <td className="py-2 pr-4">{r.parsed.categoryName || 'Uncategorized'}</td>
                  <td className="py-2 pr-4 tabular-nums">{r.parsed.amount ? fmtMoney(r.parsed.amount, r.parsed.currency ?? '') : '—'}</td>
                  <td className="py-2 pr-4 text-xs text-[var(--critical)]">{r.errors.join('; ')}</td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
      )}

      {commitResult && (
        <Card title="Import complete">
          <p className="text-sm text-[var(--good)]">Created {commitResult.createdCount} transaction(s).</p>
          {commitResult.failedCount > 0 && <p className="text-sm text-[var(--critical)]">{commitResult.failedCount} row(s) failed during import.</p>}
        </Card>
      )}
    </div>
  );
}
