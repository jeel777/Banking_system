import { useState, useEffect } from 'react';
import { accounts, transactions } from '../../api/client';
import { v4 as uuidv4 } from 'react';

export default function Transfer() {
  const [userAccounts, setUserAccounts] = useState([]);
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    accounts.list().then(d => {
      setUserAccounts(d.accounts.filter(a => a.status === 'active'));
    });
  }, []);

  const handleTransfer = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const data = await transactions.create({
        fromAccount,
        toAccount,
        amount: parseFloat(amount),
        idempotencyKey: crypto.randomUUID()
      });
      setResult(data);
      setAmount('');
      setToAccount('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>Transfer Money</h1>
        <p>Send funds to another account</p>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        {result ? (
          <div className="transfer-result">
            <div className="result-icon">✅</div>
            <h2>Transfer Successful!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
              ₹{result.transaction?.amount?.toLocaleString('en-IN')} has been sent.
            </p>
            <button className="btn btn-primary" onClick={() => setResult(null)}>Make Another Transfer</button>
          </div>
        ) : (
          <form onSubmit={handleTransfer}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label>From Account</label>
              <select className="form-select" value={fromAccount} onChange={e => setFromAccount(e.target.value)} required>
                <option value="">Select your account</option>
                {userAccounts.map(acc => (
                  <option key={acc._id} value={acc._id}>
                    ...{acc._id.slice(-8)} ({acc.currency})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>To Account (Recipient ID)</label>
              <input className="form-input" type="text" placeholder="Paste recipient account ID" value={toAccount} onChange={e => setToAccount(e.target.value)} required />
            </div>

            <div className="form-group">
              <label>Amount (₹)</label>
              <input className="form-input" type="number" placeholder="0.00" min="1" max="1000000" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={loading}>
              {loading ? 'Processing...' : `Send ₹${amount || '0'}`}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
