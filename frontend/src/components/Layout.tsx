import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/accounts', label: 'Accounts' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/import', label: 'Import' },
  { to: '/budgets', label: 'Budget' },
  { to: '/recurring', label: 'Recurring' },
  { to: '/savings', label: 'Savings Goals' },
  { to: '/investments', label: 'Investments' },
  { to: '/lending', label: 'Lending' },
  { to: '/debts', label: 'Debts' },
  { to: '/net-worth', label: 'Net Worth' },
  { to: '/analytics', label: 'Reports' },
  { to: '/annual-review', label: 'Annual Review' },
  { to: '/system-check', label: 'System Check' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <div className="min-h-screen bg-[var(--page)] md:flex">
      <aside className="border-b border-[var(--border)] bg-[var(--surface-1)] md:w-56 md:min-h-screen md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <div className="text-lg font-semibold text-[var(--text-primary)]">PFMS</div>
            <div className="text-xs text-[var(--muted)]">Personal Financial OS</div>
          </div>
          <button
            onClick={toggle}
            aria-label="Toggle dark mode"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded-lg border border-[var(--border-strong)] p-1.5 text-xs text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-white/10"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-[var(--brand)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-white/10'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={logout}
            className="mt-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--muted)] hover:bg-gray-100 dark:hover:bg-white/10"
          >
            Log out
          </button>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
