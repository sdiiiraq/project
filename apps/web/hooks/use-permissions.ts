'use client';

import { useAuthStore } from '@/stores/auth-store';

/** التحقق في الواجهة للراحة فقط — الخادم هو المرجع (§10/§134) */
export function usePermissions() {
  const { user, hasPermission, hasRole } = useAuthStore();
  return {
    user,
    hasPermission,
    hasRole,
    can: (permission: string) => hasPermission(permission),
    canAny: (permissions: string[]) => permissions.some((p) => hasPermission(p)),
  };
}
