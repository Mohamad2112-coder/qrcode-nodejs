/**
 * API client for the QR Order SaaS frontend.
 * Wraps fetch with auth token, error handling, and request timeouts.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function getToken() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('qr_token');
  } catch (_e) {
    return null;
  }
}

async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let body = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    if (!response.ok) {
      const err = new Error(body && body.message ? body.message : `Request failed: ${response.status}`);
      err.status = response.status;
      err.code = body && body.code ? body.code : 'HTTP_ERROR';
      err.details = body && body.details ? body.details : undefined;
      throw err;
    }

    return body;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Request timed out');
      timeoutErr.status = 408;
      timeoutErr.code = 'REQUEST_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  }
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

/**
 * Auth helpers
 */
export function setToken(token) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('qr_token', token);
}

export function getAuthToken() {
  return getToken();
}

export function removeToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('qr_token');
}

/**
 * Order API
 */
export const orders = {
  create: (payload) => api.post('/api/v1/orders', payload),
  list: (params) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/api/v1/orders${qs ? `?${qs}` : ''}`);
  },
  get: (orderId) => api.get(`/api/v1/orders/${orderId}`),
  transition: (orderId, status) => api.post(`/api/v1/orders/${orderId}/status`, { status }),
  track: (token) => api.get(`/api/v1/orders/track/${token}`),
};

/**
 * Sync API (Edge Hub)
 */
export const sync = {
  batch: (payload) => api.post('/api/v1/sync', payload),
  batches: () => api.get('/api/v1/sync/batches'),
};

/**
 * Push subscription API
 */
export const push = {
  subscribe: (payload) => api.post('/api/v1/push/subscribe', payload),
  unsubscribe: (payload) => api.delete('/api/v1/push/subscribe', { body: JSON.stringify(payload) }),
  notifyReady: (payload) => api.post('/api/v1/push/notify/ready', payload),
};

/**
 * VAPID public key
 */
export const vapid = {
  publicKey: () => api.get('/api/v1/vapid-public-key'),
};

/**
 * Health
 */
export const health = () => api.get('/health');
