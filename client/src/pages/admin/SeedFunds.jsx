import { useState, useEffect } from 'react';
import { admin } from '../../api/client';

export default function SeedFunds() {
  const [allAccounts, setAllAccounts] = useState([]);
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { loadAccounts(); }, []);

  async function loadAccounts() {
    try {
      const data = await admin.listAllAccounts('limit=100');
      setAllAccounts(data.accounts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setSubmitting(true);
    try {
      const data = await admin.seedFunds({ toAccount, amount: parseFloat(amount) });
      setResult(data);
      setAmount('');
      setToAccount('');
      // Refresh account list to show updated balances
      loadAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loader"><div className="spinner"></div> Loading accounts...</div>;

  return (
    <>
      <div className="page-header">
        <h1>💰 Seed Funds</h1>
        <p>Send money from the system bank to any account</p>
      </div>

      {/* Seed Form */}
      <div className="card" style={{ maxWidth: 560, marginBottom: 28 }}>
        {result ? (
          <div className="transfer-result">
            <div className="result-icon">✅</div>
            <h2>Funds Seeded Successfully!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
              ₹{result.transaction?.amount?.toLocaleString('en-IN')} sent to <strong>{result.recipient?.userName}</strong>
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
              New balance: <strong style={{ color: 'var(--success)' }}>₹{result.recipient?.newBalance?.toLocaleString('en-IN')}</strong>
            </p>
            <button className="btn btn-primary" onClick={() => setResult(null)}>Seed More Funds</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label>Recipient Account</label>
              <select className="form-select" value={toAccount} onChange={e => setToAccount(e.target.value)} required>
                <option value="">Select an account to fund</option>
                {allAccounts
                  .filter(a => a.user?.role !== 'system')
                  .map(acc => (
                    <option key={acc._id} value={acc._id}>
                      {acc.user?.name} ({acc.user?.email}) — ...{acc._id.slice(-6)} — ₹{acc.balance?.toLocaleString('en-IN')} [{acc.status}]
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label>Amount (₹)</label>
              <input
                className="form-input"
                type="number"
                placeholder="Enter amount to seed"
                min="1"
                max="10000000"
                step="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
              />
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={submitting}>
              {submitting ? 'Seeding...' : `💰 Seed ₹${amount ? parseFloat(amount).toLocaleString('en-IN') : '0'}`}
            </button>
          </form>
        )}
      </div>

      {/* All Accounts Table */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12 }}>All Accounts</h2>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Account ID</th>
              <th>Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {allAccounts.map(acc => (
              <tr key={acc._id}>
                <td style={{ fontWeight: 600 }}>{acc.user?.name || '—'}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{acc.user?.email || '—'}</td>
                <td>
                  <span className={`badge ${acc.user?.role === 'admin' ? 'badge-accent' : acc.user?.role === 'system' ? 'badge-info' : 'badge-success'}`}>
                    {acc.user?.role || '—'}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  ...{acc._id.slice(-8)}
                </td>
                <td style={{ fontWeight: 700, color: acc.balance > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                  ₹{acc.balance?.toLocaleString('en-IN')}
                </td>
                <td>
                  <span className={`badge ${acc.status === 'active' ? 'badge-success' : acc.status === 'frozen' ? 'badge-danger' : 'badge-warning'}`}>
                    {acc.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
