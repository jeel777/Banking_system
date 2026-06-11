import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">🏦 Delvadiya's Bank</div>
        <div className="logo-sub">Banking Dashboard</div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Account</div>
        <NavLink to="/dashboard" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <span className="icon">📊</span> Dashboard
        </NavLink>
        <NavLink to="/dashboard/transfer" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <span className="icon">💸</span> Transfer
        </NavLink>
        <NavLink to="/dashboard/transactions" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <span className="icon">📋</span> Transactions
        </NavLink>

        {user?.role === 'admin' && (
          <>
            <div className="sidebar-section-label">Administration</div>
            <NavLink to="/admin" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="icon">🛡️</span> Overview
            </NavLink>
            <NavLink to="/admin/fraud-alerts" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="icon">🚨</span> Fraud Alerts
            </NavLink>
            <NavLink to="/admin/seed-funds" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="icon">💰</span> Seed Funds
            </NavLink>
            <NavLink to="/admin/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="icon">👥</span> Users
            </NavLink>
            <NavLink to="/admin/ledger" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="icon">📒</span> Ledger
            </NavLink>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="user-name">{user?.name}</div>
            <div className="user-role">{user?.role}</div>
          </div>
        </div>
        <button className="btn btn-outline btn-sm" style={{ width: '100%' }} onClick={handleLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}
