import { useState, useEffect } from 'react';
import { accounts, transactions } from '../../api/client';

export default function Dashboard() {
  const [userAccounts, setUserAccounts] = useState([]);
  const [balances, setBalances] = useState({});
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [accData, txData] = await Promise.all([
        accounts.list(),
        transactions.list('limit=5')
      ]);
      setUserAccounts(accData.accounts);
      setRecentTx(txData.transactions);

      // Fetch balances for each account
      const bals = {};
      for (const acc of accData.accounts) {
        try {
          const b = await accounts.balance(acc._id);
          bals[acc._id] = b.balance;
        } catch { bals[acc._id] = 0; }
      }
      setBalances(bals);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAccount() {
    setCreating(true);
    try {
      await accounts.create();
      await loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  const totalBalance = Object.values(balances).reduce((a, b) => a + b, 0);

  if (loading) return <div className="loader"><div className="spinner"></div> Loading dashboard...</div>;

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of your banking accounts</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card accent">
          <span className="stat-label">Total Balance</span>
          <span className="stat-value">₹{totalBalance.toLocaleString('en-IN')}</span>
        </div>
        <div className="stat-card info">
          <span className="stat-label">Accounts</span>
          <span className="stat-value">{userAccounts.length}</span>
        </div>
        <div className="stat-card success">
          <span className="stat-label">Recent Transactions</span>
          <span className="stat-value">{recentTx.length}</span>
        </div>
      </div>

      {/* Accounts */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Your Accounts</h2>
        <button className="btn btn-primary btn-sm" onClick={handleCreateAccount} disabled={creating}>
          {creating ? 'Creating...' : '+ New Account'}
        </button>
      </div>

      {userAccounts.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">🏦</div>
          <p>No accounts yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="stats-grid" style={{ marginBottom: 32 }}>
          {userAccounts.map(acc => (
            <div className="card" key={acc._id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={`badge ${acc.status === 'active' ? 'badge-success' : acc.status === 'frozen' ? 'badge-danger' : 'badge-warning'}`}>
                  {acc.status}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{acc.currency}</span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>
                ₹{(balances[acc._id] || 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                ID: {acc._id}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Transactions */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12 }}>Recent Transactions</h2>
      {recentTx.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">📋</div>
          <p>No transactions yet.</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.map(tx => (
                <tr key={tx._id}>
                  <td>{new Date(tx.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                  <td style={{ fontWeight: 600 }}>₹{tx.amount?.toLocaleString('en-IN')}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{tx.fromAccount?._id?.slice(-6) || tx.fromAccount?.slice(-6) || '—'}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{tx.toAccount?._id?.slice(-6) || tx.toAccount?.slice(-6) || '—'}</td>
                  <td>
                    <span className={`badge ${tx.status === 'completed' ? 'badge-success' : tx.status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
