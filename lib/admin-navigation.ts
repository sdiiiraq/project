// أسماء أيقونات فقط (بيانات قابلة للتسلسل) — نفس نمط lib/navigation.ts، لتفادي تمرير
// مراجع مكوّنات React عبر حدود Server/Client Components.
export type AdminIconName = "LayoutDashboard" | "Building2" | "Package" | "LifeBuoy" | "ScrollText" | "GraduationCap";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: AdminIconName;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "لوحة التحكم", icon: "LayoutDashboard" },
  { href: "/admin/workspaces", label: "المولدات (Workspaces)", icon: "Building2" },
  { href: "/admin/plans", label: "الباقات", icon: "Package" },
  { href: "/admin/support", label: "الدعم الفني", icon: "LifeBuoy" },
  { href: "/admin/help-guides", label: "الشروحات والتعليمات", icon: "GraduationCap" },
  { href: "/admin/audit", label: "سجل التدقيق", icon: "ScrollText" },
];
