/**
 * SyncEngine + SyncQueue + ConflictResolver (§185).
 * - المزامنة idempotent: الخادم يخصم المكررة عبر clientTransactionId (§21/§26).
 * - الصراعات المالية لا تُحسم بـ last-write-wins (§27)؛ تدخل CONFLICT وتتطلب قرارًا.
 * - لا فقدان لمعاملة أوفلاين أبدًا (§211-79).
 */
import { OfflineRepository, type LocalPayment, type SyncStatus } from './db';
import { useOfflineStore } from '@/stores/offline-store';

interface SyncPushItem {
  clientTransactionId: string;
  entityType: 'PAYMENT';
  payload: Record<string, unknown>;
  createdOfflineAt: string;
}

interface SyncResultItem {
  clientTransactionId: string;
  status: 'SYNCED' | 'CONFLICT' | 'FAILED';
  serverEntityId?: string;
  receiptNumber?: string;
  error?: string;
}

const API_BASE = '/api/v1';

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('access_token');
}

export const SyncQueue = {
  /** جمع المعاملات المعلقة للدفع */
  async getPending(): Promise<LocalPayment[]> {
    return OfflineRepository.getLocalPaymentsByStatus('PENDING');
  },

  async markSyncing(clientTransactionId: string): Promise<void> {
    await OfflineRepository.updateLocalPaymentStatus(clientTransactionId, 'SYNCING');
  },

  async markSynced(clientTransactionId: string, serverPaymentId?: string, receiptNumber?: string): Promise<void> {
    await OfflineRepository.updateLocalPaymentStatus(clientTransactionId, 'SYNCED', { serverPaymentId, receiptNumber });
  },

  async markFailed(clientTransactionId: string, error: string): Promise<void> {
    await OfflineRepository.updateLocalPaymentStatus(clientTransactionId, 'FAILED', { errorMessage: error });
  },

  async markConflict(clientTransactionId: string, error: string): Promise<void> {
    await OfflineRepository.updateLocalPaymentStatus(clientTransactionId, 'CONFLICT', { errorMessage: error });
  },
};

export const ConflictResolver = {
  /**
   * حل الصراع من الخادم (§27/§68). لا نحل محليًا تلقائيًا للمال؛
   * نعرض الحالة للمستخدم المخوَّل ليقرر APPLY أو REJECT.
   */
  async resolve(clientTransactionId: string, action: 'APPLY' | 'REJECT'): Promise<void> {
    const token = getAccessToken();
    const res = await fetch(`${API_BASE}/sync/resolve-conflict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ clientTransactionId, action }),
    });
    if (!res.ok) throw new Error('تعذر حل الصراع');
    if (action === 'REJECT') {
      await OfflineRepository.deleteLocalPayment(clientTransactionId);
    } else {
      await OfflineRepository.updateLocalPaymentStatus(clientTransactionId, 'SYNCED');
    }
  },
};

export const SyncEngine = {
  _syncing: false,

  async getPendingCount(): Promise<number> {
    const pending = await SyncQueue.getPending();
    const failed = await OfflineRepository.getLocalPaymentsByStatus('FAILED');
    const conflicts = await OfflineRepository.getLocalPaymentsByStatus('CONFLICT');
    return pending.length + failed.length + conflicts.length;
  },

  async updateStoreCounts(): Promise<void> {
    const count = await SyncEngine.getPendingCount();
    useOfflineStore.getState().setPendingCount(count);
  },

  /** دفع كل المعاملات المعلقة إلى الخادم مع فحص idempotency */
  async syncAll(): Promise<{ synced: number; failed: number; conflicts: number }> {
    if (SyncEngine._syncing) return { synced: 0, failed: 0, conflicts: 0 };
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!online) return { synced: 0, failed: 0, conflicts: 0 };

    SyncEngine._syncing = true;
    useOfflineStore.getState().setSyncState('SYNCING');
    let synced = 0, failed = 0, conflicts = 0;

    try {
      const pending = await SyncQueue.getPending();
      if (pending.length === 0) {
        useOfflineStore.getState().setSyncState('SYNCED');
        return { synced: 0, failed: 0, conflicts: 0 };
      }

      const items: SyncPushItem[] = pending.map((p) => ({
        clientTransactionId: p.clientTransactionId,
        entityType: 'PAYMENT',
        payload: {
          customerId: p.customerId,
          billId: p.billId,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          paymentDate: p.paymentDate,
        },
        createdOfflineAt: p.createdOfflineAt,
      }));

      for (const p of pending) await SyncQueue.markSyncing(p.clientTransactionId);

      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ deviceId: pending[0]?.deviceId ?? 'unknown', transactions: items }),
      });

      if (!res.ok) {
        // فشل الشبكة/الخادم — أعد الكل إلى PENDING ليُعاد لاحقًا (§211-79)
        for (const p of pending) await SyncQueue.markFailed(p.clientTransactionId, 'فشل الاتصال بالخادم');
        failed = pending.length;
        useOfflineStore.getState().setSyncState('FAILED');
        return { synced, failed, conflicts };
      }

      const body = (await res.json()) as { data: { results: SyncResultItem[] } };
      for (const r of body.data.results) {
        if (r.status === 'SYNCED') {
          await SyncQueue.markSynced(r.clientTransactionId, r.serverEntityId, r.receiptNumber);
          synced++;
        } else if (r.status === 'CONFLICT') {
          await SyncQueue.markConflict(r.clientTransactionId, r.error ?? 'تعارض مع حالة الخادم');
          conflicts++;
        } else {
          await SyncQueue.markFailed(r.clientTransactionId, r.error ?? 'فشل غير معروف');
          failed++;
        }
      }
      useOfflineStore.getState().setSyncState(failed > 0 ? 'FAILED' : conflicts > 0 ? 'CONFLICT' : 'SYNCED');
    } catch {
      useOfflineStore.getState().setSyncState('FAILED');
    } finally {
      SyncEngine._syncing = false;
      await SyncEngine.updateStoreCounts();
    }
    return { synced, failed, conflicts };
  },

  /** سحب بيانات الجابي المعينين وتخزينهم محليًا للعمل دون اتصال (§164) */
  async pullAssignedCustomers(): Promise<number> {
    const token = getAccessToken();
    const res = await fetch(`${API_BASE}/collections/my-customers`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) return 0;
    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    const cached = body.data.map((c) => ({
      id: c.id as string,
      customerNumber: c.customerNumber as string,
      fullName: c.fullName as string,
      phonePrimary: c.phonePrimary as string,
      outstandingBalance: (c.outstandingBalance as string) ?? '0',
      generatorId: c.generatorId as string,
      generatorName: c.generatorName as string | undefined,
      cachedAt: new Date().toISOString(),
    }));
    await OfflineRepository.cacheCustomers(cached);
    return cached.length;
  },
};

/** مراقبة الاتصال والمزامنة التلقائية عند العودة (§26/§186) */
export function initSyncEngine(): void {
  if (typeof window === 'undefined') return;
  const handleOnline = () => {
    useOfflineStore.getState().setOnline(true);
    void SyncEngine.syncAll();
  };
  const handleOffline = () => useOfflineStore.getState().setOnline(false);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  useOfflineStore.getState().setOnline(navigator.onLine);
  void SyncEngine.updateStoreCounts();
}
