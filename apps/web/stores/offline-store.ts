import { create } from 'zustand';

/** حالة المزامنة دون اتصال (§96/§186): يجب أن يكون المؤشر واضحًا دائمًا للجابي. */
export type SyncState = 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'PENDING' | 'SYNCED' | 'FAILED' | 'CONFLICT';

interface OfflineState {
  isOnline: boolean;
  syncState: SyncState;
  pendingCount: number;
  setOnline: (online: boolean) => void;
  setSyncState: (state: SyncState) => void;
  setPendingCount: (count: number) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncState: 'ONLINE',
  pendingCount: 0,
  setOnline: (isOnline) => set({ isOnline, syncState: isOnline ? 'ONLINE' : 'OFFLINE' }),
  setSyncState: (syncState) => set({ syncState }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
}));
