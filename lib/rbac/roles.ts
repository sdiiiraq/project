import type { MemberRole } from "@prisma/client";
import type { PermissionKey } from "./permissions";

// خريطة الأدوار الافتراضية إلى الصلاحيات — تُستخدم في seed وكمصدر واحد للحقيقة عند فحصها في الكود.
export const DEFAULT_ROLE_PERMISSIONS: Record<MemberRole, PermissionKey[]> = {
  OWNER: [
    "customers.read", "customers.create", "customers.update", "customers.delete",
    "subscriptions.read", "subscriptions.manage",
    "payments.read", "payments.create", "payments.adjust",
    "collectors.manage",
    "expenses.read", "expenses.create",
    "fuel.read", "fuel.create", "fuel.update", "fuel.delete",
    "maintenance.read", "maintenance.create",
    "generator.manage",
    "reports.read", "reports.export",
    "settings.manage", "team.manage", "billing.manage", "audit.read",
  ],
  ADMIN: [
    "customers.read", "customers.create", "customers.update", "customers.delete",
    "subscriptions.read", "subscriptions.manage",
    "payments.read", "payments.create", "payments.adjust",
    "collectors.manage",
    "expenses.read", "expenses.create",
    "fuel.read", "fuel.create", "fuel.update", "fuel.delete",
    "maintenance.read", "maintenance.create",
    "generator.manage",
    "reports.read", "reports.export",
    "settings.manage", "team.manage", "audit.read",
  ],
  ACCOUNTANT: [
    "customers.read",
    "subscriptions.read",
    "payments.read", "payments.create", "payments.adjust",
    "expenses.read", "expenses.create",
    "reports.read", "reports.export",
  ],
  COLLECTOR: [
    "customers.read",
    "payments.read", "payments.create",
  ],
  MAINTENANCE: [
    "maintenance.read", "maintenance.create",
    "fuel.read", "fuel.create", "fuel.update", "fuel.delete",
    "generator.manage",
  ],
  VIEWER: [
    "customers.read",
    "subscriptions.read",
    "payments.read",
    "expenses.read",
    "reports.read",
  ],
};
