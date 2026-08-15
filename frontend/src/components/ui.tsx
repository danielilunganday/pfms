import type { ReactNode } from 'react';

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-sm ${className}`}>
      {title && <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{title}</h3>}
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'good' | 'critical';
}) {
  const color = tone === 'good' ? 'text-[var(--good)]' : tone === 'critical' ? 'text-[var(--critical)]' : 'text-[var(--text-primary)]';
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">{label}</div>
      <div className={`mt-1 tabular-nums text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--text-secondary)]">{sub}</div>}
    </div>
  );
}

export function StatusBadge({ status, label: labelOverride }: { status: 'OK' | 'WARNING' | 'OVER' | string; label?: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    OK: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-800 dark:text-green-300', label: 'On track' },
    WARNING: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-300', label: 'Near limit' },
    OVER: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-800 dark:text-red-300', label: 'Over budget' },
    ACTIVE: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-800 dark:text-blue-300', label: 'Active' },
    OVERDUE: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-800 dark:text-red-300', label: 'Overdue' },
    REPAID: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-800 dark:text-green-300', label: 'Repaid' },
    WRITTEN_OFF: { bg: 'bg-gray-200 dark:bg-white/10', text: 'text-gray-700 dark:text-gray-300', label: 'Written off' },
    OUTSTANDING: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-300', label: 'Outstanding' },
    PARTIAL: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-300', label: 'Partial' },
    PAID: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-800 dark:text-green-300', label: 'Paid' },
    COMPLETED: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-800 dark:text-green-300', label: 'Completed' },
    ERROR: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-800 dark:text-red-300', label: 'Error' },
  };
  const s = map[status] ?? { bg: 'bg-gray-100 dark:bg-white/10', text: 'text-gray-700 dark:text-gray-300', label: status };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {labelOverride ?? s.label}
    </span>
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  className?: string;
}) {
  const base = 'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)]',
    secondary: 'bg-white dark:bg-[var(--surface-1)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-white/10',
    danger: 'bg-[var(--critical)] text-white hover:opacity-90',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none ${props.className ?? ''}`}
    />
  );
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none ${props.className ?? ''}`}
    >
      {children}
    </select>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{children}</label>;
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
      </table>
    </div>
  );
}
