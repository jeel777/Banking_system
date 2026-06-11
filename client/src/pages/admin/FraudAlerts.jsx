import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { admin } from '../../api/client';

const RISK_BADGE = {
  low: 'badge-risk-low',
  medium: 'badge-risk-medium',
  high: 'badge-risk-high',
  critical: 'badge-risk-critical',
};

const STATUS_BADGE = {
  flagged: 'badge-warning',
  reviewed: 'badge-info',
  dismissed: 'badge-success',
  confirmed_fraud: 'badge-danger',
};

export default function FraudAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', riskLevel: '', page: 1 });
  const navigate = useNavigate();

  useEffect(() => { loadAlerts(); }, [filters]);

  async function loadAlerts() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', filters.page);
      params.set('limit', '15');
      if (filters.status) params.set('status', filters.status);
      if (filters.riskLevel) params.set('riskLevel', filters.riskLevel);

      const data = await admin.getFraudAlerts(params.toString());
      setAlerts(data.alerts);
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
        <h1>🚨 Fraud Alerts</h1>
        <p>Monitor and review flagged transactions</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="form-select" style={{ width: 160 }} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
          <option value="">All Status</option>
          <option value="flagged">Flagged</option>
          <option value="reviewed">Reviewed</option>
          <option value="dismissed">Dismissed</option>
          <option value="confirmed_fraud">Confirmed Fraud</option>
        </select>
        <select className="form-select" style={{ width: 160 }} value={filters.riskLevel} onChange={e => setFilters(f => ({ ...f, riskLevel: e.target.value, page: 1 }))}>
          <option value="">All Risk Levels</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner"></div> Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">✅</div>
          <p>No fraud alerts found.</p>
        </div>
      ) : (
        <>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Risk Score</th>
                  <th>Risk Level</th>
                  <th>Status</th>
                  <th>Rules</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map(alert => (
                  <tr key={alert._id}>
                    <td>{new Date(alert.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ fontWeight: 600 }}>₹{alert.amount?.toLocaleString('en-IN')}</td>
                    <td>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: alert.riskScore >= 80 ? 'var(--risk-critical)' : alert.riskScore >= 50 ? 'var(--risk-high)' : 'var(--risk-medium)' }}>
                        {alert.riskScore}
                      </span>
                    </td>
                    <td><span className={`badge ${RISK_BADGE[alert.riskLevel]}`}>{alert.riskLevel}</span></td>
                    <td><span className={`badge ${STATUS_BADGE[alert.status]}`}>{alert.status.replace('_', ' ')}</span></td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {alert.triggeredRules?.length || 0} rules
                    </td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/admin/fraud-alerts/${alert._id}`)}>
                        View
                      </button>
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
