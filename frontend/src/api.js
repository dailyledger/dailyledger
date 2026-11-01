import { IS_ADMIN_SITE } from './appMode';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
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

/**
 * Carries the HTTP status and payload so callers can react to specific cases —
 * notably the 409 the server returns when a write would take stock negative and
 * needs the operator to confirm.
 */
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** Stock would go negative; resubmit with allow_negative to record it anyway. */
  get needsStockConfirmation() {
    return this.status === 409 && this.body?.error === 'stock_would_go_negative';
  }

  get shortfalls() {
    return this.body?.shortfalls || [];
  }
}

/**
 * One key per form submission, so a double-tap on a slow connection is recognised
 * by the server as the same write instead of creating a second record.
 */
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function request(path, options = {}) {
  const { idempotencyKey, ...rest } = options;

  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    ...rest,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    throw new ApiError(
      data?.message || data?.error || `Request failed with status ${res.status}`,
      res.status,
      data
    );
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

const post = (path, payload, idempotencyKey) =>
  request(path, { method: 'POST', body: JSON.stringify(payload), idempotencyKey });

const put = (path, payload) => request(path, { method: 'PUT', body: JSON.stringify(payload) });

const patch = (path, payload) =>
  request(path, { method: 'PATCH', body: JSON.stringify(payload) });

const del = (path, payload) =>
  request(path, { method: 'DELETE', body: JSON.stringify(payload || {}) });

export const login = (username, password) =>
  request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, portal: IS_ADMIN_SITE ? 'admin' : 'stall' }),
  });

export const getItems = () => request('/items');
export const getItem = (id) => request(`/items/${id}`);
export const getItemMovements = (id) => request(`/items/${id}/movements`);

export const getSales = (range) => request(withDateRange('/sales', range));
export const getSale = (id) => request(`/sales/${id}`);
export const createSale = (payload, key) => post('/sales', payload, key);
export const updateSale = (id, payload) => put(`/sales/${id}`, payload);
export const cancelSale = (id, reason) => del(`/sales/${id}`, { reason });
export const getSaleReturns = (id) => request(`/sales/${id}/returns`);
export const createSaleReturn = (id, payload, key) => post(`/sales/${id}/return`, payload, key);
export const cancelSaleReturn = (id, returnId, allowNegative) =>
  del(`/sales/${id}/return/${returnId}`, allowNegative ? { allow_negative: true } : {});

export const getPurchases = (range) => request(withDateRange('/purchases', range));
export const getPurchase = (id) => request(`/purchases/${id}`);
export const createPurchase = (payload, key) => post('/purchases', payload, key);
export const updatePurchase = (id, payload) => put(`/purchases/${id}`, payload);
export const cancelPurchase = (id, reason) => del(`/purchases/${id}`, { reason });
export const getPurchaseReturns = (id) => request(`/purchases/${id}/returns`);
export const createPurchaseReturn = (id, payload, key) =>
  post(`/purchases/${id}/return`, payload, key);
export const cancelPurchaseReturn = (id, returnId) =>
  del(`/purchases/${id}/return/${returnId}`);

export const getCredits = (range) => request(withDateRange('/credits', range));
export const getCredit = (id) => request(`/credits/${id}`);
export const createCredit = (payload, key) => post('/credits', payload, key);
export const updateCredit = (id, payload) => put(`/credits/${id}`, payload);
export const cancelCredit = (id, reason) => del(`/credits/${id}`, { reason });
export const payCredit = (id, amount_paid, payment_mode = 'cash') =>
  request(`/credits/${id}/pay`, {
    method: 'PATCH',
    body: JSON.stringify({ amount_paid, payment_mode }),
  });
export const cancelCreditPayment = (id, paymentId) => del(`/credits/${id}/payment/${paymentId}`);
export const createCreditReturn = (id, payload, key) => post(`/credits/${id}/return`, payload, key);
export const cancelCreditReturn = (id, returnId, allowNegative) =>
  del(`/credits/${id}/return/${returnId}`, allowNegative ? { allow_negative: true } : {});

export const changeItemKind = (id, kind) => patch(`/items/${id}/kind`, { kind });

export const getSpoilageEntries = (range) => request(withDateRange('/spoilage', range));
export const getSpoilageEntry = (id) => request(`/spoilage/${id}`);
export const createSpoilage = (payload, key) => post('/spoilage', payload, key);
export const updateSpoilage = (id, payload) => put(`/spoilage/${id}`, payload);
export const cancelSpoilage = (id, reason) => del(`/spoilage/${id}`, { reason });

export const getProductions = (range) => request(withDateRange('/production', range));
export const createProduction = (payload, key) => post('/production', payload, key);
export const cancelProduction = (id, reason, allowNegative) =>
  del(`/production/${id}`, { reason, ...(allowNegative ? { allow_negative: true } : {}) });

export const getDashboardSummary = (period = 'day') =>
  request(`/dashboard/summary?period=${period}`);

// ---- Admin console ----

function withParams(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

export const adminGetStalls = () => request('/admin/stalls');
export const adminCreateStall = (payload) => post('/admin/stalls', payload);
export const adminUpdateStall = (id, payload) => patch(`/admin/stalls/${id}`, payload);
export const adminResetPassword = (id, password) =>
  post(`/admin/stalls/${id}/reset-password`, { password });
export const adminSetStallActive = (id, active) => patch(`/admin/stalls/${id}/active`, { active });
export const adminDeleteStall = (id, confirm_name) => del(`/admin/stalls/${id}`, { confirm_name });

export const adminGetComparison = (filters) => request(withParams('/admin/comparison', filters));
export const adminGetOverview = (filters) => request(withParams('/admin/overview', filters));
export const adminGetRecent = (filters) => request(withParams('/admin/recent', filters));
export const adminGetAnalytics = (filters) => request(withParams('/admin/analytics', filters));
export const adminGetReport = (kind, filters) =>
  request(withParams(`/admin/reports/${kind}`, filters));
export const adminGetVoided = (filters) => request(withParams('/admin/voided', filters));
