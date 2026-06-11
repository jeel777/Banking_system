import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/dashboard/Dashboard';
import Transfer from './pages/dashboard/Transfer';
import Transactions from './pages/dashboard/Transactions';
import AdminDashboard from './pages/admin/AdminDashboard';
import FraudAlerts from './pages/admin/FraudAlerts';
import FraudAlertDetail from './pages/admin/FraudAlertDetail';
import Users from './pages/admin/Users';
import Ledger from './pages/admin/Ledger';
import SeedFunds from './pages/admin/SeedFunds';

function AppLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

function AuthRedirect({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loader"><div className="spinner"></div> Loading...</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<AuthRedirect><Login /></AuthRedirect>} />
          <Route path="/register" element={<AuthRedirect><Register /></AuthRedirect>} />

          {/* Protected dashboard routes */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/transfer" element={<Transfer />} />
            <Route path="/dashboard/transactions" element={<Transactions />} />
          </Route>

          {/* Protected admin routes */}
          <Route element={<ProtectedRoute adminOnly><AppLayout /></ProtectedRoute>}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/fraud-alerts" element={<FraudAlerts />} />
            <Route path="/admin/fraud-alerts/:id" element={<FraudAlertDetail />} />
            <Route path="/admin/seed-funds" element={<SeedFunds />} />
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/ledger" element={<Ledger />} />
          </Route>

          {/* Redirect root to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
