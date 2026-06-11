import { useState, useEffect } from 'react';
import { transactions } from '../../api/client';

export default function Transactions() {
  const [txList, setTxList] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: '', status: '', page: 1 });

  useEffect(() => { loadTransactions(); }, [filters]);

  async function loadTransactions() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', filters.page);
      params.set('limit', '10');
      if (filters.type) params.set('type', filters.type);
      if (filters.status) params.set('status', filters.status);

      const data = await transactions.list(params.toString());
      setTxList(data.transactions);
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
        <h1>Transaction History</h1>
        <p>View all your past transactions</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="form-select" style={{ width: 160 }} value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value, page: 1 }))}>
          <option value="">All Types</option>
          <option value="sent">Sent</option>
          <option value="received">Received</option>
        </select>
        <select className="form-select" style={{ width: 160 }} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
          <option value="">All Status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="reversed">Reversed</option>
        </select>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner"></div> Loading...</div>
      ) : txList.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">📋</div>
          <p>No transactions found.</p>
        </div>
      ) : (
        <>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {txList.map(tx => (
                  <tr key={tx._id}>
                    <td>{new Date(tx.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ fontWeight: 600 }}>₹{tx.amount?.toLocaleString('en-IN')}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ...{(tx.fromAccount?._id || tx.fromAccount || '').slice(-6)}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ...{(tx.toAccount?._id || tx.toAccount || '').slice(-6)}
                    </td>
                    <td>
                      <span className={`badge ${tx.status === 'completed' ? 'badge-success' : tx.status === 'failed' ? 'badge-danger' : 'badge-warning'}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td>
                      {tx.riskScore > 0 ? (
                        <span className={`badge ${tx.riskScore >= 80 ? 'badge-risk-critical' : tx.riskScore >= 50 ? 'badge-risk-high' : 'badge-risk-medium'}`}>
                          {tx.riskScore}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button disabled={pagination.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>← Prev</button>
            <span className="page-info">Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
            <button disabled={pagination.page >= pagination.totalPages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next →</button>
          </div>
        </>
      )}
    </>
  );
}
