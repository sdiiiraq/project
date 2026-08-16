// مفاتيح صفحات ثابتة (لا تعتمد على نص العرض) تُستخدم للربط بين شاشات التطبيق ودليل
// "الشروحات والتعليمات" — تُستخدم في كل من إعدادات صاحب المنصة (اختيار الصفحة) وفي
// الصفحات نفسها (جلب الشرح المرتبط بها). لا تُغيّر هذه المفاتيح بعد إضافتها.
export type HelpPageKey =
  | "dashboard"
  | "customers"
  | "customers.new"
  | "customers.detail"
  | "subscriptions"
  | "collectors"
  | "expenses"
  | "fuel"
  | "maintenance"
  | "operating-sessions"
  | "reports"
  | "analytics"
  | "assistant"
  | "settings";

export const HELP_PAGE_OPTIONS: { key: HelpPageKey; label: string }[] = [
  { key: "dashboard", label: "لوحة التحكم الرئيسية" },
  { key: "customers", label: "صفحة المشتركين" },
  { key: "customers.new", label: "إضافة مشترك جديد" },
  { key: "customers.detail", label: "ملف المشترك" },
  { key: "subscriptions", label: "صفحة الاشتراكات" },
  { key: "collectors", label: "صفحة الجباة" },
  { key: "expenses", label: "صفحة المصاريف" },
  { key: "fuel", label: "صفحة الوقود" },
  { key: "maintenance", label: "صفحة الصيانة" },
  { key: "operating-sessions", label: "جلسات التشغيل" },
  { key: "reports", label: "صفحة التقارير" },
  { key: "analytics", label: "صفحة التحليلات" },
  { key: "assistant", label: "المساعد الذكي" },
  { key: "settings", label: "صفحة الإعدادات" },
];

export function helpPageLabel(key: string): string {
  return HELP_PAGE_OPTIONS.find((p) => p.key === key)?.label ?? key;
}
