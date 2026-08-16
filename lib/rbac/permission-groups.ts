import { PERMISSIONS, type PermissionKey } from "./permissions";

// تجميع الصلاحيات لعرضها بشكل منظم عند إضافة/تعديل موظف — قسم واحد لكل جزء من النظام.
export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  { label: "المشتركين", keys: ["customers.read", "customers.create", "customers.update", "customers.delete"] },
  { label: "الاشتراكات", keys: ["subscriptions.read", "subscriptions.manage"] },
  { label: "الدفعات", keys: ["payments.read", "payments.create", "payments.adjust"] },
  { label: "المصاريف", keys: ["expenses.read", "expenses.create"] },
  { label: "الوقود", keys: ["fuel.read", "fuel.create", "fuel.update", "fuel.delete"] },
  { label: "الصيانة", keys: ["maintenance.read", "maintenance.create"] },
  { label: "المولدة وجلسات التشغيل", keys: ["generator.manage"] },
  { label: "التقارير", keys: ["reports.read", "reports.export"] },
  { label: "الإعدادات وفريق العمل", keys: ["settings.manage", "team.manage"] },
  { label: "الفوترة وسجل التدقيق", keys: ["billing.manage", "audit.read"] },
];

export function permissionLabel(key: PermissionKey): string {
  return PERMISSIONS[key];
}
