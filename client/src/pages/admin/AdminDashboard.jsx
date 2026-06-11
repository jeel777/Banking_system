import { useState, useEffect } from 'react';
import { admin } from '../../api/client';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    admin.getFraudStats()
      .then(d => setStats(d.stats))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loader"><div className="spinner"></div> Loading admin dashboard...</div>;

  return (
    <>
      <div className="page-header">
        <h1>🛡️ Admin Overview</h1>
        <p>System monitoring and fraud detection statistics</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card accent">
          <span className="stat-label">Total Fraud Alerts</span>
          <span className="stat-value">{stats?.totalAlerts || 0}</span>
        </div>
        <div className="stat-card warning">
          <span className="stat-label">Pending Review</span>
          <span className="stat-value">{stats?.pendingReview || 0}</span>
        </div>
        <div className="stat-card danger">
          <span className="stat-label">Confirmed Fraud</span>
          <span className="stat-value">{stats?.confirmedFraud || 0}</span>
        </div>
        <div className="stat-card success">
          <span className="stat-label">Dismissed</span>
          <span className="stat-value">{stats?.dismissed || 0}</span>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card danger">
          <span className="stat-label">Critical Alerts</span>
          <span className="stat-value">{stats?.criticalAlerts || 0}</span>
        </div>
        <div className="stat-card warning">
          <span className="stat-label">High-Risk Alerts</span>
          <span className="stat-value">{stats?.highAlerts || 0}</span>
        </div>
        <div className="stat-card info">
          <span className="stat-label">Last 24h Alerts</span>
          <span className="stat-value">{stats?.last24hAlerts || 0}</span>
        </div>
        <div className="stat-card accent">
          <span className="stat-label">Total Blocked Amount</span>
          <span className="stat-value">₹{(stats?.totalBlockedAmount || 0).toLocaleString('en-IN')}</span>
        </div>
      </div>
    </>
  );
}
