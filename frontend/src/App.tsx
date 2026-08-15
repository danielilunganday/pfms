import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { Transactions } from './pages/Transactions';
import { Budgets } from './pages/Budgets';
import { Recurring } from './pages/Recurring';
import { Savings } from './pages/Savings';
import { Investments } from './pages/Investments';
import { Lending } from './pages/Lending';
import { Debts } from './pages/Debts';
import { NetWorth } from './pages/NetWorth';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';
import { Import } from './pages/Import';
import { SystemCheck } from './pages/SystemCheck';
import { AnnualReview } from './pages/AnnualReview';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/savings" element={<Savings />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/lending" element={<Lending />} />
          <Route path="/debts" element={<Debts />} />
          <Route path="/net-worth" element={<NetWorth />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/annual-review" element={<AnnualReview />} />
          <Route path="/import" element={<Import />} />
          <Route path="/system-check" element={<SystemCheck />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
