// سجل الصلاحيات المركزي — كل صلاحية جديدة تُضاف هنا أولًا. المالك يملكها كلها دائمًا،
// والموظف يُمنح كل صلاحية على حدة (WorkspaceMemberPermission)، لا عبر أدوار ثابتة.
export const PERMISSIONS = {
  "customers.read": "عرض المشتركين",
  "customers.create": "إضافة مشترك",
  "customers.update": "تعديل مشترك",
  "customers.delete": "حذف مشترك",
  "subscriptions.read": "عرض الاشتراكات",
  "subscriptions.manage": "إدارة الاشتراكات والأمبيرات",
  "payments.read": "عرض الدفعات",
  "payments.create": "تسجيل دفعة",
  "payments.adjust": "تصحيح دفعة",
  "expenses.read": "عرض المصاريف",
  "expenses.create": "إضافة مصروف",
  "fuel.read": "عرض الوقود",
  "fuel.create": "تسجيل شراء/استهلاك وقود",
  "fuel.update": "تعديل سجلات الوقود",
  "fuel.delete": "حذف سجلات الوقود",
  "maintenance.read": "عرض الصيانة",
  "maintenance.create": "تسجيل صيانة",
  "maintenance.delete": "حذف سجلات الصيانة",
  "generator.manage": "إدارة بيانات المولدة",
  "reports.read": "عرض التقارير",
  "reports.export": "تصدير التقارير",
  "settings.manage": "إدارة الإعدادات",
  "team.manage": "إدارة المستخدمين والأدوار",
  "billing.manage": "إدارة اشتراك المنصة والفوترة",
  "audit.read": "عرض سجل التدقيق",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
