import { create } from 'zustand';
import { apiClient, clearTokens, loadTokensFromStorage, setTokens } from '@/lib/api-client';

/**
 * حالة المصادقة في Zustand (§96): حالة عميل خفيفة فقط،
 * بيانات الخادم تُدار عبر TanStack Query وليس هنا.
 */
interface AuthUser {
  id: string;
  name: string;
  phone: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (phone, password) => {
    const res = await apiClient.auth.login({ phone, password });
    setTokens(res.accessToken, res.refreshToken);
    const me = await apiClient.auth.me();
    set({ user: me, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try { await apiClient.auth.logout(); } catch { /* تجاهل فشل الخlogout عند الخروج */ }
    clearTokens();
    set({ user: null, isAuthenticated: false, isLoading: false });
    if (typeof window !== 'undefined') window.location.href = '/login';
  },

  fetchMe: async () => {
    loadTokensFromStorage();
    try {
      const me = await apiClient.auth.me();
      set({ user: me, isAuthenticated: true, isLoading: false });
    } catch {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  // التحقق في الواجهة للراحة فقط؛ الخادم هو المرجع (§10)
  hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,
  hasRole: (role) => get().user?.roles.includes(role) ?? false,
}));
