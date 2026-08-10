/**
 * OfflineRepository (§185): تجريد IndexedDB — لا تصل المكونات إلى IndexedDB مباشرة.
 * لا تُخزَّن بيانات الاعتماد في IndexedDB (§188)؛ فقط بيانات تشغيلية مؤقتة.
 */

const DB_NAME = 'generator_offline';
const DB_VERSION = 1;

export const PAYMENTS_STORE = 'local_payments';
export const CUSTOMERS_STORE = 'cached_customers';

export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';

export interface LocalPayment {
  clientTransactionId: string;
  customerId: string;
  customerName: string;
  billId?: string;
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  createdOfflineAt: string;
  deviceId: string;
  syncStatus: SyncStatus;
  serverPaymentId?: string;
  receiptNumber?: string;
  errorMessage?: string;
}

export interface CachedCustomer {
  id: string;
  customerNumber: string;
  fullName: string;
  phonePrimary: string;
  outstandingBalance: string;
  generatorId: string;
  generatorName?: string;
  cachedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB غير متاح'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PAYMENTS_STORE)) {
        const store = db.createObjectStore(PAYMENTS_STORE, { keyPath: 'clientTransactionId' });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('customerId', 'customerId', { unique: false });
      }
      if (!db.objectStoreNames.contains(CUSTOMERS_STORE)) {
        db.createObjectStore(CUSTOMERS_STORE, { keyPath: 'id' });
      }
    };
  });
  return dbPromise;
}

function withStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export const OfflineRepository = {
  // ---------- Local payments ----------
  async saveLocalPayment(payment: LocalPayment): Promise<void> {
    await withStore(PAYMENTS_STORE, 'readwrite', (s) => s.put(payment));
  },

  async getLocalPayment(clientTransactionId: string): Promise<LocalPayment | undefined> {
    return withStore<LocalPayment | undefined>(PAYMENTS_STORE, 'readonly', (s) => s.get(clientTransactionId));
  },

  async getAllLocalPayments(): Promise<LocalPayment[]> {
    return withStore<LocalPayment[]>(PAYMENTS_STORE, 'readonly', (s) => s.getAll());
  },

  async getLocalPaymentsByStatus(status: SyncStatus): Promise<LocalPayment[]> {
    return withStore<LocalPayment[]>(PAYMENTS_STORE, 'readonly', (s) => s.index('syncStatus').getAll(status));
  },

  async updateLocalPaymentStatus(clientTransactionId: string, status: SyncStatus, extra?: Partial<LocalPayment>): Promise<void> {
    const existing = await OfflineRepository.getLocalPayment(clientTransactionId);
    if (!existing) return;
    await withStore(PAYMENTS_STORE, 'readwrite', (s) => s.put({ ...existing, syncStatus: status, ...extra }));
  },

  async deleteLocalPayment(clientTransactionId: string): Promise<void> {
    await withStore(PAYMENTS_STORE, 'readwrite', (s) => s.delete(clientTransactionId));
  },

  // ---------- Cached customers ----------
  async cacheCustomers(customers: CachedCustomer[]): Promise<void> {
    await withStore(CUSTOMERS_STORE, 'readwrite', (s) => {
      // استبدال كامل لذاكرة التخزين المؤقتة للمشتركين المعينين
      s.clear();
      for (const c of customers) s.put(c);
    });
  },

  async getCachedCustomers(): Promise<CachedCustomer[]> {
    return withStore<CachedCustomer[]>(CUSTOMERS_STORE, 'readonly', (s) => s.getAll());
  },

  async getCachedCustomer(id: string): Promise<CachedCustomer | undefined> {
    return withStore<CachedCustomer | undefined>(CUSTOMERS_STORE, 'readonly', (s) => s.get(id));
  },

  /** تنظيف عند تسجيل الخروج (§188) */
  async clearAll(): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([PAYMENTS_STORE, CUSTOMERS_STORE], 'readwrite');
      tx.objectStore(PAYMENTS_STORE).clear();
      tx.objectStore(CUSTOMERS_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

/** معرف الجهاز — يُستخدم لتتبع المعاملات دون اتصال (§26/§189) */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    localStorage.setItem('device_id', id);
  }
  return id;
}

export function generateClientTransactionId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
