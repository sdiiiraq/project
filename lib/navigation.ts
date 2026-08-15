import type { PermissionKey } from "@/lib/rbac/permissions";

// أسماء أيقونات فقط (بيانات قابلة للتسلسل) — لا نمرّر مراجع مكوّنات React مباشرة من
// Server Components إلى Client Components. الربط الفعلي بمكوّنات lucide-react يتم
// داخل المكوّنات العميلة نفسها عبر NAV_ICON_MAP.
export type NavIconName =
  | "LayoutDashboard"
  | "Users"
  | "FileText"
  | "Wallet"
  | "UserCog"
  | "Receipt"
  | "Fuel"
  | "Wrench"
  | "BarChart3"
  | "LineChart"
  | "Settings"
  | "LifeBuoy"
  | "Sparkles";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  permission?: PermissionKey;
  mobilePriority?: number; // أقل رقم = أولوية أعلى في شريط التنقل السفلي
  group?: string; // تجميع منطقي للعناصر داخل الشريط الجانبي
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "الرئيسية", icon: "LayoutDashboard", mobilePriority: 1, group: "عام" },
  { href: "/customers", label: "المشتركين", icon: "Users", permission: "customers.read", mobilePriority: 2, group: "المشتركين" },
  { href: "/subscriptions", label: "الاشتراكات", icon: "FileText", permission: "subscriptions.read", group: "المشتركين" },
  { href: "/collectors", label: "الجباة", icon: "UserCog", permission: "collectors.manage", group: "المشتركين" },
  { href: "/expenses", label: "المصاريف", icon: "Receipt", permission: "expenses.read", mobilePriority: 4, group: "التشغيل" },
  { href: "/fuel", label: "الوقود", icon: "Fuel", permission: "fuel.read", mobilePriority: 3, group: "التشغيل" },
  { href: "/maintenance", label: "الصيانة", icon: "Wrench", permission: "maintenance.read", group: "التشغيل" },
  { href: "/reports", label: "التقارير", icon: "BarChart3", permission: "reports.read", group: "التحليل" },
  { href: "/analytics", label: "التحليلات", icon: "LineChart", permission: "reports.read", group: "التحليل" },
  { href: "/assistant", label: "المساعد الذكي", icon: "Sparkles", permission: "reports.read", group: "التحليل" },
  { href: "/support", label: "الدعم الفني", icon: "LifeBuoy", group: "النظام" },
  { href: "/settings", label: "الإعدادات", icon: "Settings", permission: "settings.manage", group: "النظام" },
];
