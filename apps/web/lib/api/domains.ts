/**
 * عملاء API للمجالات (§183): لا fetch متناثر في المكونات.
 * يعيد استخدام إدارة الرموز من api-client.
 */
import { ApiClientError, clearTokens } from '@/lib/api-client';

const API_BASE = '/api/v1';

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('access_token');
}

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && !isRetry) {
    const refreshToken = typeof window !== 'undefined' ? sessionStorage.getItem('refresh_token') : null;
    if (refreshToken) {
      const refreshed = await tryRefresh(refreshToken);
      if (refreshed) return request<T>(path, options, true);
    }
    clearTokens();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiClientError('TOKEN_EXPIRED', 'انتهت الجلسة', 401);
  }

  if (!res.ok) {
    let body: { error?: { code: string; message: string } } | null = null;
    try { body = await res.json(); } catch { body = null; }
    throw new ApiClientError(body?.error?.code ?? 'INTERNAL_ERROR', body?.error?.message ?? 'حدث خطأ', res.status);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as { data: T };
  return body.data;
}

async function tryRefresh(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
    sessionStorage.setItem('access_token', body.data.accessToken);
    sessionStorage.setItem('refresh_token', body.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// ---------- Subscriptions ----------
export interface Subscription {
  id: string; customerId: string; generatorId: string; amperePlanId: string;
  startDate: string; endDate: string | null; status: string; billingCycle: string;
  customPrice: string | null; customAmpere: string | null;
  discountType: string | null; discountValue: string | null; notes: string | null;
  customer?: { id: string; fullName: string; customerNumber: string };
  amperePlan?: { id: string; name: string; ampereAmount: string; price: string };
}
export const subscriptionsClient = {
  list: (params?: Record<string, string>) =>
    request<{ items: Subscription[]; meta: { page: number; pageSize: number; total: number } }>(`/subscriptions${toQuery(params)}`),
  get: (id: string) => request<Subscription>(`/subscriptions/${id}`),
  create: (data: Record<string, unknown>) => request<Subscription>('/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  suspend: (id: string) => request<Subscription>(`/subscriptions/${id}/suspend`, { method: 'POST' }),
  cancel: (id: string, data: { reason: string; effectiveDate: string }) =>
    request<Subscription>(`/subscriptions/${id}/cancel`, { method: 'POST', body: JSON.stringify(data) }),
  reactivate: (id: string) => request<Subscription>(`/subscriptions/${id}/reactivate`, { method: 'POST' }),
  history: (id: string) => request<unknown[]>(`/subscriptions/${id}/history`),
};

// ---------- Plans ----------
export interface AmperePlan {
  id: string; generatorId: string; name: string; ampereAmount: string; price: string;
  currency: string; billingCycle: string; effectiveFrom: string; effectiveTo: string | null; status: string;
}
export const plansClient = {
  list: (params?: Record<string, string>) => request<{ items: AmperePlan[]; meta: unknown }>(`/plans${toQuery(params)}`),
  create: (data: Record<string, unknown>) => request<AmperePlan>('/plans', { method: 'POST', body: JSON.stringify(data) }),
  revise: (id: string, data: { price: string; effectiveFrom: string }) =>
    request<AmperePlan>(`/plans/${id}/revise`, { method: 'POST', body: JSON.stringify(data) }),
};

// ---------- Generators/C customers (تكملة ما لم يكن في api-client) ----------
export interface Generator {
  id: string; organizationId: string; name: string; code: string | null;
  city: string | null; governorate: string | null; status: string; operatingStatus: string;
  fuelType: string; capacity: string | null;
}
export const generatorsClient = {
  list: (params?: Record<string, string>) =>
    request<{ items: Generator[]; meta: { page: number; pageSize: number; total: number } }>(`/generators${toQuery(params)}`),
  get: (id: string) => request<Generator>(`/generators/${id}`),
  create: (data: Record<string, unknown>) => request<Generator>('/generators', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) => request<Generator>(`/generators/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  archive: (id: string) => request<void>(`/generators/${id}`, { method: 'DELETE' }),
  dashboard: (id: string) => request<Record<string, string | number>>(`/generators/${id}/dashboard`),
  activity: (id: string) => request<unknown[]>(`/generators/${id}/activity`),
};

export interface Customer {
  id: string; organizationId: string; generatorId: string; customerNumber: string;
  fullName: string; phonePrimary: string; phoneSecondary?: string | null; address: string | null; neighborhood: string | null; houseNumber?: string | null;
  status: string; outstandingBalance?: string;
  generator?: { id: string; name: string };
}
export const customersClient = {
  list: (params?: Record<string, string>) =>
    request<{ items: Customer[]; meta: { page: number; pageSize: number; total: number } }>(`/customers${toQuery(params)}`),
  get: (id: string) => request<Customer>(`/customers/${id}`),
  create: (data: Record<string, unknown>) => request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) => request<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  archive: (id: string, data: { reason: string }) => request<void>(`/customers/${id}/archive`, { method: 'POST', body: JSON.stringify(data) }),
  bills: (id: string) => request<unknown[]>(`/customers/${id}/bills`),
  payments: (id: string) => request<unknown[]>(`/customers/${id}/payments`),
  subscriptions: (id: string) => request<Subscription[]>(`/customers/${id}/subscriptions`),
};

// ---------- Billing (معاينة/توليد/إصدار) ----------
export interface BillPreviewRow {
  customerId: string; customerName: string; baseCharge: string; discountAmount: string;
  penaltyAmount: string; previousDebt: string; totalAmount: string;
}
export interface BillPreview { count: number; rows: BillPreviewRow[]; totals: Record<string, string> }
export const billingClient = {
  preview: (data: { generatorId: string; periodStart: string; periodEnd: string }) =>
    request<BillPreview>('/bills/preview', { method: 'POST', body: JSON.stringify(data) }),
  generate: (data: { generatorId: string; periodStart: string; periodEnd: string; idempotencyKey?: string }) =>
    request<{ runId: string; created: number }>('/bills/generate', { method: 'POST', body: JSON.stringify(data) }),
  list: (params?: Record<string, string>) => request<{ items: unknown[]; meta: { page: number; pageSize: number; total: number } }>(`/bills${toQuery(params)}`),
  get: (id: string) => request<Record<string, unknown>>(`/bills/${id}`),
  issue: (id: string) => request<unknown>(`/bills/${id}/issue`, { method: 'POST' }),
  adjust: (id: string, data: { amount: string; type: string; reason: string }) =>
    request<unknown>(`/bills/${id}/adjust`, { method: 'POST', body: JSON.stringify(data) }),
  void: (id: string, data: { reason: string }) => request<unknown>(`/bills/${id}/void`, { method: 'POST', body: JSON.stringify(data) }),
  history: (id: string) => request<unknown[]>(`/bills/${id}/history`),
  runs: () => request<unknown[]>('/bills/runs'),
};

function toQuery(params?: Record<string, string>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

// ---------- Expenses ----------
export interface Expense {
  id: string; generatorId: string | null; categoryId: string; amount: string; currency: string;
  expenseDate: string; description: string; paymentMethod: string; referenceNumber: string | null;
  status: string; rejectedReason: string | null;
  category?: { id: string; name: string; nameAr: string | null };
  generator?: { id: string; name: string } | null;
}
export interface ExpenseCategory { id: string; name: string; nameAr: string | null }
export const expensesClient = {
  list: (params?: Record<string, string>) =>
    request<{ items: Expense[]; meta: { page: number; pageSize: number; total: number } }>(`/expenses${toQuery(params)}`),
  categories: () => request<ExpenseCategory[]>('/expenses/categories'),
  createCategory: (data: { name: string; nameAr?: string }) =>
    request<ExpenseCategory>('/expenses/categories', { method: 'POST', body: JSON.stringify(data) }),
  create: (data: Record<string, unknown>) => request<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  approve: (id: string) => request<Expense>(`/expenses/${id}/approve`, { method: 'POST' }),
  reject: (id: string, data: { reason: string }) => request<Expense>(`/expenses/${id}/reject`, { method: 'POST', body: JSON.stringify(data) }),
};

// ---------- Fuel ----------
export interface FuelPurchase {
  id: string; generatorId: string; supplierId: string | null; quantity: string; unit: string;
  unitCost: string; purchaseDate: string; invoiceNumber: string | null; status: string;
  generator?: { id: string; name: string };
}
export interface FuelSupplier { id: string; name: string; phone: string | null; notes: string | null }
export const fuelClient = {
  suppliers: () => request<FuelSupplier[]>('/fuel/suppliers'),
  createSupplier: (data: { name: string; phone?: string; notes?: string }) =>
    request<FuelSupplier>('/fuel/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  purchases: (params?: Record<string, string>) =>
    request<{ items: FuelPurchase[]; meta: { page: number; pageSize: number; total: number } }>(`/fuel/purchases${toQuery(params)}`),
  createPurchase: (data: Record<string, unknown>) => request<FuelPurchase>('/fuel/purchases', { method: 'POST', body: JSON.stringify(data) }),
  approvePurchase: (id: string) => request<FuelPurchase>(`/fuel/purchases/${id}/approve`, { method: 'POST' }),
  rejectPurchase: (id: string, data: { reason: string }) =>
    request<FuelPurchase>(`/fuel/purchases/${id}/reject`, { method: 'POST', body: JSON.stringify(data) }),
  inventory: (params?: Record<string, string>) => request<unknown[]>(`/fuel/inventory${toQuery(params)}`),
  analytics: (params?: Record<string, string>) => request<Record<string, unknown>>(`/fuel/analytics${toQuery(params)}`),
};

// ---------- Maintenance ----------
export interface MaintenanceRecord {
  id: string; generatorId: string; type: string; date: string; description: string;
  status: string; cost: string | null;
  generator?: { id: string; name: string };
}
export const maintenanceClient = {
  list: (params?: Record<string, string>) =>
    request<{ items: MaintenanceRecord[]; meta: { page: number; pageSize: number; total: number } }>(`/maintenance${toQuery(params)}`),
  create: (data: Record<string, unknown>) => request<MaintenanceRecord>('/maintenance', { method: 'POST', body: JSON.stringify(data) }),
  start: (id: string) => request<MaintenanceRecord>(`/maintenance/${id}/start`, { method: 'POST' }),
  complete: (id: string, data?: Record<string, unknown>) =>
    request<MaintenanceRecord>(`/maintenance/${id}/complete`, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  cancel: (id: string) => request<MaintenanceRecord>(`/maintenance/${id}/cancel`, { method: 'POST' }),
  spareParts: () => request<unknown[]>('/maintenance/spare-parts'),
};

// ---------- Operations ----------
export interface GeneratorOutage {
  id: string; generatorId: string; type: string; reason: string; startedAt: string; endedAt: string | null;
  generator?: { id: string; name: string };
}
export const operationsClient = {
  outages: (params?: Record<string, string>) => request<{ items: GeneratorOutage[]; meta: unknown }>(`/operations/outages${toQuery(params)}`),
  startOutage: (data: Record<string, unknown>) => request<GeneratorOutage>('/operations/outages', { method: 'POST', body: JSON.stringify(data) }),
  endOutage: (id: string) => request<GeneratorOutage>(`/operations/outages/${id}/end`, { method: 'POST' }),
  runtime: (params?: Record<string, string>) => request<{ items: unknown[]; meta: unknown }>(`/operations/runtime${toQuery(params)}`),
  startRuntime: (data: Record<string, unknown>) => request<unknown>('/operations/runtime', { method: 'POST', body: JSON.stringify(data) }),
  stopRuntime: (id: string) => request<unknown>(`/operations/runtime/${id}/stop`, { method: 'POST' }),
  changeStatus: (data: { generatorId: string; status: string; reason?: string }) =>
    request<unknown>('/operations/status', { method: 'POST', body: JSON.stringify(data) }),
};

// ---------- Employees ----------
export interface Employee {
  id: string; name: string; phone: string | null; role: string; employeeCode: string;
  generatorId: string | null; status: string; hireDate: string | null;
  generator?: { id: string; name: string } | null;
}
export const employeesClient = {
  list: (params?: Record<string, string>) =>
    request<{ items: Employee[]; meta: { page: number; pageSize: number; total: number } }>(`/employees${toQuery(params)}`),
  create: (data: Record<string, unknown>) => request<Employee>('/employees', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) => request<Employee>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ---------- Reports ----------
export const reportsClient = {
  revenue: (params?: Record<string, string>) => request<Record<string, unknown>>(`/reports/revenue${toQuery(params)}`),
  outstanding: (params?: Record<string, string>) => request<Record<string, unknown>>(`/reports/outstanding${toQuery(params)}`),
  profitability: (params?: Record<string, string>) => request<Record<string, unknown>>(`/reports/profitability${toQuery(params)}`),
};

// ---------- Audit ----------
export interface AuditLogEntry {
  id: string; action: string; entityType: string; entityId: string | null; createdAt: string;
  actor?: { id: string; name: string } | null;
}
export const auditClient = {
  list: (params?: Record<string, string>) =>
    request<{ items: AuditLogEntry[]; meta: { page: number; pageSize: number; total: number } }>(`/audit${toQuery(params)}`),
  actions: () => request<{ action: string; count: number }[]>('/audit/actions'),
};

// ---------- Organization settings ----------
export interface OrganizationProfile {
  id: string; name: string; legalName?: string | null; phone?: string | null; email?: string | null;
  address?: string | null; city?: string | null; governorate?: string | null;
}
export const organizationsClient = {
  me: () => request<OrganizationProfile>('/organizations/me'),
  update: (data: Record<string, unknown>) => request<OrganizationProfile>('/organizations/me', { method: 'PATCH', body: JSON.stringify(data) }),
  settings: () => request<Record<string, unknown>>('/organizations/settings'),
  setSetting: (key: string, value: unknown) => request<unknown>(`/organizations/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
};

// ---------- Exports ----------
export interface ExportJobItem { id: string; reportKey: string; status: string; rowCount: number; requestedAt: string }
export const exportsClient = {
  list: () => request<ExportJobItem[]>('/exports'),
  create: (data: { reportKey: string; generatorId?: string; from?: string; to?: string }) =>
    request<ExportJobItem>('/exports', { method: 'POST', body: JSON.stringify(data) }),
};
