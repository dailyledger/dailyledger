export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
console.log('[DEBUG] API_URL:', API_URL);
console.log('[DEBUG] import.meta.env:', JSON.stringify(import.meta.env));
const BASE_URL = `${API_URL}/api`;

let authToken = null;
let onUnauthorized = null;

export function setAuthToken(token) {
  authToken = token;
}

export function clearAuthToken() {
  authToken = null;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    ...options,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }

  return data;
}

function withDateRange(path, { from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export const login = (username, password) =>
  request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });

export const getItems = () => request('/items');
export const getItem = (id) => request(`/items/${id}`);

export const getSales = (range) => request(withDateRange('/sales', range));
export const getSale = (id) => request(`/sales/${id}`);
export const createSale = (payload) =>
  request('/sales', { method: 'POST', body: JSON.stringify(payload) });
export const updateSale = (id, payload) =>
  request(`/sales/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export const getPurchases = (range) => request(withDateRange('/purchases', range));
export const getPurchase = (id) => request(`/purchases/${id}`);
export const createPurchase = (payload) =>
  request('/purchases', { method: 'POST', body: JSON.stringify(payload) });
export const updatePurchase = (id, payload) =>
  request(`/purchases/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export const getCredits = (range) => request(withDateRange('/credits', range));
export const getCredit = (id) => request(`/credits/${id}`);
export const createCredit = (payload) =>
  request('/credits', { method: 'POST', body: JSON.stringify(payload) });
export const updateCredit = (id, payload) =>
  request(`/credits/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
export const payCredit = (id, amount_paid) =>
  request(`/credits/${id}/pay`, {
    method: 'PATCH',
    body: JSON.stringify({ amount_paid }),
  });

export const getSpoilageEntries = (range) => request(withDateRange('/spoilage', range));
export const getSpoilageEntry = (id) => request(`/spoilage/${id}`);
export const createSpoilage = (payload) =>
  request('/spoilage', { method: 'POST', body: JSON.stringify(payload) });
export const updateSpoilage = (id, payload) =>
  request(`/spoilage/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export const getDashboardSummary = (period = 'day') =>
  request(`/dashboard/summary?period=${period}`);
