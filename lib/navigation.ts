import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Wallet,
  UserCog,
  Receipt,
  Fuel,
  Wrench,
  BarChart3,
  LineChart,
  Settings,
  LifeBuoy,
  Sparkles,
} from "lucide-react";
import type { PermissionKey } from "@/lib/rbac/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: PermissionKey;
  mobilePriority?: number; // أقل رقم = أولوية أعلى في شريط التنقل السفلي
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard, mobilePriority: 1 },
  { href: "/customers", label: "المشتركين", icon: Users, permission: "customers.read", mobilePriority: 2 },
  { href: "/collections", label: "الجباية", icon: Wallet, permission: "payments.read", mobilePriority: 3 },
  { href: "/subscriptions", label: "الاشتراكات", icon: FileText, permission: "subscriptions.read" },
  { href: "/collectors", label: "الجباة", icon: UserCog, permission: "collectors.manage" },
  { href: "/expenses", label: "المصاريف", icon: Receipt, permission: "expenses.read" },
  { href: "/fuel", label: "الوقود", icon: Fuel, permission: "fuel.read" },
  { href: "/maintenance", label: "الصيانة", icon: Wrench, permission: "maintenance.read" },
  { href: "/reports", label: "التقارير", icon: BarChart3, permission: "reports.read" },
  { href: "/analytics", label: "التحليلات", icon: LineChart, permission: "reports.read" },
  { href: "/assistant", label: "المساعد الذكي", icon: Sparkles, permission: "reports.read" },
  { href: "/support", label: "الدعم الفني", icon: LifeBuoy },
  { href: "/settings", label: "الإعدادات", icon: Settings, permission: "settings.manage" },
];
