import { useState, useEffect } from 'react';
import { admin } from '../../api/client';

export default function Ledger() {
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => { loadLedger(); }, [page]);

  async function loadLedger() {
    setLoading(true);
    try {
      const data = await admin.getLedger(`page=${page}&limit=25`);
      setEntries(data.entries);
      setPagination(data.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>📒 System Ledger</h1>
        <p>Complete audit trail of all financial entries</p>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner"></div> Loading ledger...</div>
      ) : entries.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">📒</div>
          <p>No ledger entries yet.</p>
        </div>
      ) : (
        <>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Account</th>
                  <th>Transaction</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry._id}>
                    <td>
                      <span className={`badge ${entry.type === 'credit' ? 'badge-success' : 'badge-danger'}`}>
                        {entry.type === 'credit' ? '↓ Credit' : '↑ Debit'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: entry.type === 'credit' ? 'var(--success)' : 'var(--danger)' }}>
                      {entry.type === 'credit' ? '+' : '-'}₹{entry.amount?.toLocaleString('en-IN')}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      ...{(entry.account?._id || entry.account || '').slice(-8)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      ...{(entry.transaction?._id || entry.transaction || '').slice(-8)}
                    </td>
                    <td>
                      <span className={`badge ${entry.transaction?.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                        {entry.transaction?.status || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span className="page-info">Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)</span>
            <button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        </>
      )}
    </>
  );
}
