/**
 * عميل API مطبوع (§183): لا تُستخدم fetch مباشرة في المكونات.
 * يعالج التنسيقات الموحدة (§73) وتحديث الرمز تلقائيًا (§79).
 */

const API_BASE = '/api/v1';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown[] };
  requestId?: string;
}

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string | null, refresh: string | null): void {
  accessToken = access;
  refreshToken = refresh;
  if (typeof window !== 'undefined') {
    if (access) sessionStorage.setItem('access_token', access);
    else sessionStorage.removeItem('access_token');
    if (refresh) sessionStorage.setItem('refresh_token', refresh);
    else sessionStorage.removeItem('refresh_token');
  }
}

export function loadTokensFromStorage(): void {
  if (typeof window === 'undefined') return;
  accessToken = sessionStorage.getItem('access_token');
  refreshToken = sessionStorage.getItem('refresh_token');
}

export function clearTokens(): void {
  setTokens(null, null);
}

async function parseError(res: Response): Promise<never> {
  let body: ApiErrorBody | null = null;
  try { body = await res.json(); } catch { body = null; }
  throw new ApiClientError(
    body?.error?.code ?? 'INTERNAL_ERROR',
    body?.error?.message ?? 'حدث خطأ',
    res.status,
    body?.requestId,
  );
}

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // محاولة تحديث الرمز عند انتهاء الوصول (§79)
  if (res.status === 401 && !isRetry && refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, true);
    clearTokens();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiClientError('TOKEN_EXPIRED', 'انتهت الجلسة', 401);
  }

  if (!res.ok) await parseError(res);
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as ApiResponse<T>;
  return body.data;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as ApiResponse<{ accessToken: string; refreshToken: string }>;
    setTokens(body.data.accessToken, body.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export const apiClient = {
  auth: {
    login: (data: { phone: string; password: string }) =>
      request<{ accessToken: string; refreshToken: string; user: unknown }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    refresh: () => request<{ accessToken: string; refreshToken: string }>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
    me: () => request<{ id: string; name: string; phone: string; organizationId: string; roles: string[]; permissions: string[] }>('/auth/me'),
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
      request<void>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
    forgotPassword: (data: { phone: string }) => request<void>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(data) }),
    resetPassword: (data: { token: string; newPassword: string }) =>
      request<void>('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),
  },
  generators: {
    list: (params?: Record<string, unknown>) => request<{ items: unknown[]; meta: unknown }>('/generators'),
    get: (id: string) => request<unknown>(`/generators/${id}`),
    create: (data: unknown) => request<unknown>('/generators', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: unknown) => request<unknown>(`/generators/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    dashboard: (id: string) => request<unknown>(`/generators/${id}/dashboard`),
  },
  customers: {
    list: (params?: Record<string, unknown>) => request<{ items: unknown[]; meta: unknown }>(`/customers`),
    get: (id: string) => request<unknown>(`/customers/${id}`),
    create: (data: unknown) => request<unknown>('/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: unknown) => request<unknown>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    archive: (id: string) => request<unknown>(`/customers/${id}/archive`, { method: 'POST' }),
    bills: (id: string) => request<unknown>(`/customers/${id}/bills`),
    payments: (id: string) => request<unknown>(`/customers/${id}/payments`),
  },
  billing: {
    preview: (data: unknown) => request<unknown>('/bills/preview', { method: 'POST', body: JSON.stringify(data) }),
    generate: (data: unknown) => request<unknown>('/bills/generate', { method: 'POST', body: JSON.stringify(data) }),
    issue: (id: string) => request<unknown>(`/bills/${id}/issue`, { method: 'POST' }),
    adjust: (id: string, data: unknown) => request<unknown>(`/bills/${id}/adjust`, { method: 'POST', body: JSON.stringify(data) }),
    void: (id: string, data: { reason: string }) => request<unknown>(`/bills/${id}/void`, { method: 'POST', body: JSON.stringify(data) }),
  },
  payments: {
    list: () => request<{ items: unknown[]; meta: unknown }>('/payments'),
    create: (data: unknown, idempotencyKey?: string) =>
      request<unknown>('/payments', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      }),
    reverse: (id: string, data: { reason: string }) => request<unknown>(`/payments/${id}/reverse`, { method: 'POST', body: JSON.stringify(data) }),
    receipt: (id: string) => request<unknown>(`/payments/${id}/receipt`),
  },
  collections: {
    myCustomers: () => request<unknown[]>('/collections/my-customers'),
    payment: (data: unknown) => request<unknown>('/collections/payment', { method: 'POST', body: JSON.stringify(data) }),
    sessions: () => request<unknown[]>('/collections/sessions'),
    submitSession: (id: string, data: unknown) => request<unknown>(`/collections/sessions/${id}/submit`, { method: 'POST', body: JSON.stringify(data) }),
  },
  dashboard: {
    overview: () => request<unknown>('/dashboard/overview'),
  },
  reports: {
    revenue: (params?: Record<string, unknown>) => request<unknown>('/reports/revenue'),
    outstanding: () => request<unknown>('/reports/outstanding'),
    profitability: () => request<unknown>('/reports/profitability'),
  },
  sync: {
    push: (data: unknown) => request<unknown>('/sync/push', { method: 'POST', body: JSON.stringify(data) }),
    pull: () => request<unknown>('/sync/pull'),
    status: () => request<unknown>('/sync/status'),
  },
};
