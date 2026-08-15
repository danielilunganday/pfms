import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Table, Button, Input, Select, StatusBadge } from '../components/ui';
import { fmtMoney, fmtDate, todayIso } from '../lib/format';

interface Borrower { id: string; fullName: string; nationalId: string | null; address: string | null; phoneNumber: string; email: string | null; notes: string | null }
interface Loan { id: string; borrowerId: string; principal: string; currency: string; dateGiven: string; interestRatePercent: string; firstDueDate: string; status: string }
interface LoanDetail {
  loan: Loan; borrower: Borrower; outstandingBalance: string;
  accruals: { periodEnd: string; openingBalance: string; interestRatePercentApplied: string; interestCharged: string; closingBalance: string }[];
  repayments: { date: string; amount: string; appliedToInterest: string; appliedToPrincipal: string }[];
}
interface Reminder { triggerType: string; scheduledFor: string; status: string; messageText: string | null }

export function Lending() {
  const qc = useQueryClient();
  const { data: borrowers } = useQuery({ queryKey: ['borrowers'], queryFn: () => api.get<Borrower[]>('/lending/borrowers') });
  const { data: loans } = useQuery({ queryKey: ['loans'], queryFn: () => api.get<Loan[]>('/lending/loans') });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<{ key: string; value: string }[]>('/settings') });
  const defaultRate = settings?.find((s) => s.key === 'default_loan_interest_rate_percent')?.value ?? '20';

  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const { data: detail } = useQuery({
    queryKey: ['loan-detail', selectedLoanId],
    queryFn: () => api.get<LoanDetail>(`/lending/loans/${selectedLoanId}`),
    enabled: !!selectedLoanId,
  });
  const { data: reminders } = useQuery({
    queryKey: ['loan-reminders', selectedLoanId],
    queryFn: () => api.get<Reminder[]>(`/lending/loans/${selectedLoanId}/reminders`),
    enabled: !!selectedLoanId,
  });

  const [borrowerForm, setBorrowerForm] = useState({ fullName: '', nationalId: '', address: '', phoneNumber: '', email: '', notes: '' });
  const createBorrower = useMutation({
    mutationFn: () => api.post('/lending/borrowers', borrowerForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['borrowers'] }); setBorrowerForm({ fullName: '', nationalId: '', address: '', phoneNumber: '', email: '', notes: '' }); },
  });

  const [loanForm, setLoanForm] = useState({ borrowerId: '', principal: '', currency: 'USD', dateGiven: todayIso(), interestRatePercent: defaultRate, firstDueDate: '' });
  const createLoan = useMutation({
    mutationFn: () => api.post('/lending/loans', { ...loanForm, interestRatePercent: loanForm.interestRatePercent || undefined, firstDueDate: loanForm.firstDueDate || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); setLoanForm({ ...loanForm, borrowerId: '', principal: '' }); },
  });

  const accrue = useMutation({
    mutationFn: (id: string) => api.post(`/lending/loans/${id}/accrue`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); qc.invalidateQueries({ queryKey: ['loan-detail'] }); },
  });

  const [rate, setRate] = useState('');
  const changeRate = useMutation({
    mutationFn: (id: string) => api.patch(`/lending/loans/${id}/interest-rate`, { ratePercent: rate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loan-detail'] }); qc.invalidateQueries({ queryKey: ['loans'] }); setRate(''); },
  });

  const [repayAmount, setRepayAmount] = useState('');
  const repay = useMutation({
    mutationFn: (id: string) => api.post(`/lending/loans/${id}/repayments`, { amount: repayAmount, date: todayIso() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loan-detail'] }); qc.invalidateQueries({ queryKey: ['loans'] }); setRepayAmount(''); },
  });

  const writeOff = useMutation({
    mutationFn: (id: string) => api.patch(`/lending/loans/${id}/write-off`, { notes: 'Written off by owner' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loan-detail'] }); qc.invalidateQueries({ queryKey: ['loans'] }); },
  });

  const borrowerName = (id: string) => borrowers?.find((b) => b.id === id)?.fullName ?? '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lending</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          People you've lent money to — with KYC details, compounding interest (currently {defaultRate}% by default, editable per loan), and SMS reminders.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Borrowers" className="lg:col-span-1">
          <div className="mb-4 max-h-64 overflow-y-auto">
            <Table headers={['Name', 'Phone']}>
              {borrowers?.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 pr-4">{b.fullName}</td>
                  <td className="py-2 pr-4 text-[var(--text-secondary)]">{b.phoneNumber}</td>
                </tr>
              ))}
            </Table>
          </div>
          <form className="space-y-2 border-t border-[var(--border)] pt-3" onSubmit={(e) => { e.preventDefault(); createBorrower.mutate(); }}>
            <div className="text-xs font-semibold text-[var(--text-secondary)]">Add borrower</div>
            <Input placeholder="Full name" value={borrowerForm.fullName} onChange={(e) => setBorrowerForm({ ...borrowerForm, fullName: e.target.value })} required />
            <Input placeholder="National ID" value={borrowerForm.nationalId} onChange={(e) => setBorrowerForm({ ...borrowerForm, nationalId: e.target.value })} />
            <Input placeholder="Address" value={borrowerForm.address} onChange={(e) => setBorrowerForm({ ...borrowerForm, address: e.target.value })} />
            <Input placeholder="Phone number (for SMS)" value={borrowerForm.phoneNumber} onChange={(e) => setBorrowerForm({ ...borrowerForm, phoneNumber: e.target.value })} required />
            <Input placeholder="Email (optional)" value={borrowerForm.email} onChange={(e) => setBorrowerForm({ ...borrowerForm, email: e.target.value })} />
            <Button type="submit" className="w-full" disabled={createBorrower.isPending}>Add borrower</Button>
          </form>
        </Card>

        <Card title="Loans given" className="lg:col-span-2">
          <Table headers={['Borrower', 'Principal', 'Rate', 'Due', 'Status', '']}>
            {loans?.map((l) => (
              <tr key={l.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5" onClick={() => setSelectedLoanId(l.id)}>
                <td className="py-2 pr-4">{borrowerName(l.borrowerId)}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(l.principal, l.currency)}</td>
                <td className="py-2 pr-4 tabular-nums">{l.interestRatePercent}%</td>
                <td className="py-2 pr-4">{fmtDate(l.firstDueDate)}</td>
                <td className="py-2 pr-4"><StatusBadge status={l.status} /></td>
                <td className="py-2 pr-4 text-[var(--brand)]">View →</td>
              </tr>
            ))}
          </Table>

          <form
            className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-4 sm:grid-cols-3"
            onSubmit={(e) => { e.preventDefault(); createLoan.mutate(); }}
          >
            <div className="col-span-2 text-xs font-semibold text-[var(--text-secondary)] sm:col-span-3">New loan</div>
            <Select value={loanForm.borrowerId} onChange={(e) => setLoanForm({ ...loanForm, borrowerId: e.target.value })} required>
              <option value="">Borrower…</option>
              {borrowers?.map((b) => <option key={b.id} value={b.id}>{b.fullName}</option>)}
            </Select>
            <Input type="number" step="0.01" placeholder="Principal" value={loanForm.principal} onChange={(e) => setLoanForm({ ...loanForm, principal: e.target.value })} required />
            <Input type="date" value={loanForm.dateGiven} onChange={(e) => setLoanForm({ ...loanForm, dateGiven: e.target.value })} required />
            <Input
              type="number" step="0.01"
              placeholder={`Rate % (default ${defaultRate})`}
              value={loanForm.interestRatePercent}
              onChange={(e) => setLoanForm({ ...loanForm, interestRatePercent: e.target.value })}
            />
            <Input type="date" placeholder="First due date" value={loanForm.firstDueDate} onChange={(e) => setLoanForm({ ...loanForm, firstDueDate: e.target.value })} />
            <Button type="submit" disabled={createLoan.isPending}>Give loan</Button>
          </form>
        </Card>
      </div>

      {detail && (
        <Card title={`Loan detail — ${detail.borrower.fullName}`}>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-[var(--muted)]">National ID</div>{detail.borrower.nationalId ?? '—'}</div>
                <div><div className="text-xs text-[var(--muted)]">Phone</div>{detail.borrower.phoneNumber}</div>
                <div className="col-span-2"><div className="text-xs text-[var(--muted)]">Address</div>{detail.borrower.address ?? '—'}</div>
                <div><div className="text-xs text-[var(--muted)]">Principal</div>{fmtMoney(detail.loan.principal, detail.loan.currency)}</div>
                <div><div className="text-xs text-[var(--muted)]">Rate</div>{detail.loan.interestRatePercent}%</div>
                <div><div className="text-xs text-[var(--muted)]">Status</div><StatusBadge status={detail.loan.status} /></div>
                <div><div className="text-xs text-[var(--muted)]">Outstanding</div><span className="font-semibold">{fmtMoney(detail.outstandingBalance, detail.loan.currency)}</span></div>
              </div>

              {detail.loan.status !== 'REPAID' && detail.loan.status !== 'WRITTEN_OFF' && (
                <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-3">
                  <Button variant="secondary" onClick={() => accrue.mutate(detail.loan.id)} disabled={accrue.isPending}>
                    Accrue interest to today
                  </Button>
                  <div className="flex gap-2">
                    <Input type="number" step="0.01" placeholder="New rate %" value={rate} onChange={(e) => setRate(e.target.value)} />
                    <Button variant="secondary" onClick={() => changeRate.mutate(detail.loan.id)} disabled={!rate || changeRate.isPending}>
                      Change rate
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input type="number" step="0.01" placeholder="Repayment amount" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} />
                    <Button onClick={() => repay.mutate(detail.loan.id)} disabled={!repayAmount || repay.isPending}>Record repayment</Button>
                  </div>
                  <Button variant="danger" onClick={() => { if (confirm('Write off this loan? It will stop accruing interest.')) writeOff.mutate(detail.loan.id); }}>
                    Write off
                  </Button>
                </div>
              )}

              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <div className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">SMS reminders</div>
                <ul className="space-y-1 text-xs">
                  {reminders?.map((r, i) => (
                    <li key={i} className="text-[var(--text-secondary)]">
                      {r.triggerType} — {fmtDate(r.scheduledFor)} — <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">Interest accrual history (audit trail)</div>
              <Table headers={['Period end', 'Opening', 'Rate', 'Interest', 'Closing']}>
                {detail.accruals.map((a, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-3 text-xs">{fmtDate(a.periodEnd)}</td>
                    <td className="py-1 pr-3 text-xs tabular-nums">{a.openingBalance}</td>
                    <td className="py-1 pr-3 text-xs tabular-nums">{a.interestRatePercentApplied}%</td>
                    <td className="py-1 pr-3 text-xs tabular-nums">{a.interestCharged}</td>
                    <td className="py-1 pr-3 text-xs tabular-nums font-medium">{a.closingBalance}</td>
                  </tr>
                ))}
              </Table>
              <div className="mb-1 mt-4 text-xs font-semibold text-[var(--text-secondary)]">Repayments</div>
              <Table headers={['Date', 'Amount', 'To interest', 'To principal']}>
                {detail.repayments.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-3 text-xs">{fmtDate(r.date)}</td>
                    <td className="py-1 pr-3 text-xs tabular-nums">{r.amount}</td>
                    <td className="py-1 pr-3 text-xs tabular-nums">{r.appliedToInterest}</td>
                    <td className="py-1 pr-3 text-xs tabular-nums">{r.appliedToPrincipal}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
