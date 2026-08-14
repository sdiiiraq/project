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
  type LucideIcon,
} from "lucide-react";
import type { NavIconName } from "@/lib/navigation";

// خريطة أسماء → مكوّنات، تُستورد فقط داخل مكوّنات عميلة (Client Components) — لا تُمرَّر
// مكوّنات الأيقونات كـ props من Server Components (غير قابلة للتسلسل عبر RSC).
export const NAV_ICON_MAP: Record<NavIconName, LucideIcon> = {
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
};
