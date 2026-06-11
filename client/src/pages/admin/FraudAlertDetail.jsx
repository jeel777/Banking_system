import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { admin } from '../../api/client';

const RISK_BADGE = { low: 'badge-risk-low', medium: 'badge-risk-medium', high: 'badge-risk-high', critical: 'badge-risk-critical' };
const STATUS_BADGE = { flagged: 'badge-warning', reviewed: 'badge-info', dismissed: 'badge-success', confirmed_fraud: 'badge-danger' };

export default function FraudAlertDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    admin.getFraudAlerts(`page=1&limit=100`).then(data => {
      const found = data.alerts.find(a => a._id === id);
      setAlert(found || null);
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  async function handleReview(status) {
    setSubmitting(true);
    setError('');
    try {
      await admin.reviewFraudAlert(id, { status, reviewNotes });
      navigate('/admin/fraud-alerts');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="loader"><div className="spinner"></div> Loading...</div>;
  if (!alert) return <div className="card empty-state"><p>Fraud alert not found.</p></div>;

  return (
    <>
      <div className="page-header">
        <h1>Fraud Alert Detail</h1>
        <p>Review and take action on this alert</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <span className={`badge ${RISK_BADGE[alert.riskLevel]}`}>{alert.riskLevel}</span>
          <span className={`badge ${STATUS_BADGE[alert.status]}`}>{alert.status.replace('_', ' ')}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem', color: alert.riskScore >= 80 ? 'var(--risk-critical)' : 'var(--risk-high)' }}>
            Score: {alert.riskScore}/100
          </span>
        </div>

        <div className="detail-grid">
          <div className="detail-item">
            <div className="detail-label">Alert ID</div>
            <div className="detail-value">{alert._id}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Date</div>
            <div className="detail-value">{new Date(alert.createdAt).toLocaleString('en-IN')}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Amount</div>
            <div className="detail-value" style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--danger)' }}>₹{alert.amount?.toLocaleString('en-IN')}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">From Account</div>
            <div className="detail-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{alert.fromAccount?._id || alert.fromAccount}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">To Account</div>
            <div className="detail-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{alert.toAccount?._id || alert.toAccount}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Linked Transaction</div>
            <div className="detail-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{alert.transaction?._id || 'Blocked (none created)'}</div>
          </div>
        </div>
      </div>

      {/* Triggered Rules */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>⚡ Triggered Rules</h3>
        {alert.triggeredRules?.length > 0 ? (
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alert.triggeredRules.map((rule, i) => (
              <li key={i} style={{ padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--warning)', fontFamily: 'var(--font-mono)' }}>
                {rule}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No rules triggered.</p>
        )}
      </div>

      {/* AI Analysis */}
      {alert.aiAnalysis && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>🤖 AI Analysis</h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.7, background: 'var(--bg-input)', padding: 14, borderRadius: 'var(--radius-sm)' }}>
            {alert.aiAnalysis}
          </p>
        </div>
      )}

      {/* Review Form */}
      {alert.status === 'flagged' && (
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>📝 Review This Alert</h3>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label>Review Notes (optional)</label>
            <textarea className="form-input" rows={3} placeholder="Add notes about your review decision..." value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-success" onClick={() => handleReview('dismissed')} disabled={submitting}>
              ✓ Dismiss (False Alarm)
            </button>
            <button className="btn btn-danger" onClick={() => handleReview('confirmed_fraud')} disabled={submitting}>
              ✕ Confirm Fraud (Freeze Account)
            </button>
          </div>
        </div>
      )}

      {alert.status !== 'flagged' && alert.reviewedBy && (
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>✅ Review Result</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <div className="detail-label">Reviewed By</div>
              <div className="detail-value">{alert.reviewedBy?.name || alert.reviewedBy}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Decision</div>
              <div className="detail-value"><span className={`badge ${STATUS_BADGE[alert.status]}`}>{alert.status.replace('_', ' ')}</span></div>
            </div>
          </div>
          {alert.reviewNotes && <p style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Notes: {alert.reviewNotes}</p>}
        </div>
      )}
    </>
  );
}
