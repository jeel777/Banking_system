// API Client — fetch wrapper with credentials for cookie-based auth

const API_BASE = '/api';

async function apiRequest(endpoint, options = {}) {
  const config = {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || `Request failed with status ${res.status}`);
  }

  return data;
}

// ─── Auth ─────────────────────────────────────────
export const auth = {
  login: (body) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),
  me: () => apiRequest('/auth/me'),
};

// ─── Accounts ─────────────────────────────────────
export const accounts = {
  list: () => apiRequest('/accounts'),
  create: () => apiRequest('/accounts', { method: 'POST', body: JSON.stringify({}) }),
  balance: (id) => apiRequest(`/accounts/balance/${id}`),
};

// ─── Transactions ─────────────────────────────────
export const transactions = {
  create: (body) => apiRequest('/transactions', { method: 'POST', body: JSON.stringify(body) }),
  list: (params = '') => apiRequest(`/transactions${params ? '?' + params : ''}`),
  getById: (id) => apiRequest(`/transactions/${id}`),
  downloadStatement: async (accountId, fromDate, toDate) => {
    const params = new URLSearchParams({ accountId });
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    const res = await fetch(`${API_BASE}/transactions/statement?${params}`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to download statement');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement_${accountId.slice(-6)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// ─── Admin ────────────────────────────────────────
export const admin = {
  getUsers: (params = '') => apiRequest(`/admin/users${params ? '?' + params : ''}`),
  getUserById: (id) => apiRequest(`/admin/users/${id}`),
  freezeAccount: (id) => apiRequest(`/admin/accounts/${id}/freeze`, { method: 'PATCH' }),
  unfreezeAccount: (id) => apiRequest(`/admin/accounts/${id}/unfreeze`, { method: 'PATCH' }),
  closeAccount: (id) => apiRequest(`/admin/accounts/${id}/close`, { method: 'PATCH' }),
  getLedger: (params = '') => apiRequest(`/admin/ledger${params ? '?' + params : ''}`),
  getFraudAlerts: (params = '') => apiRequest(`/admin/fraud-alerts${params ? '?' + params : ''}`),
  getFraudStats: () => apiRequest('/admin/fraud-alerts/stats'),
  reviewFraudAlert: (id, body) => apiRequest(`/admin/fraud-alerts/${id}/review`, { method: 'PATCH', body: JSON.stringify(body) }),
  seedFunds: (body) => apiRequest('/admin/seed-funds', { method: 'POST', body: JSON.stringify(body) }),
  listAllAccounts: (params = '') => apiRequest(`/admin/accounts${params ? '?' + params : ''}`),
};
