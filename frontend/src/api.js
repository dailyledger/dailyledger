const BASE_URL = 'http://localhost:5000/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
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

export const getItems = () => request('/items');
export const getItem = (id) => request(`/items/${id}`);

export const getSales = (range) => request(withDateRange('/sales', range));
export const getSale = (id) => request(`/sales/${id}`);
export const createSale = (payload) =>
  request('/sales', { method: 'POST', body: JSON.stringify(payload) });

export const getPurchases = (range) => request(withDateRange('/purchases', range));
export const getPurchase = (id) => request(`/purchases/${id}`);
export const createPurchase = (payload) =>
  request('/purchases', { method: 'POST', body: JSON.stringify(payload) });

export const getCredits = (range) => request(withDateRange('/credits', range));
export const getCredit = (id) => request(`/credits/${id}`);
export const createCredit = (payload) =>
  request('/credits', { method: 'POST', body: JSON.stringify(payload) });
export const payCredit = (id, amount_paid) =>
  request(`/credits/${id}/pay`, {
    method: 'PATCH',
    body: JSON.stringify({ amount_paid }),
  });

export const getSpoilageEntries = (range) => request(withDateRange('/spoilage', range));
export const getSpoilageEntry = (id) => request(`/spoilage/${id}`);
export const createSpoilage = (payload) =>
  request('/spoilage', { method: 'POST', body: JSON.stringify(payload) });

export const getDashboardSummary = (period = 'day') =>
  request(`/dashboard/summary?period=${period}`);
