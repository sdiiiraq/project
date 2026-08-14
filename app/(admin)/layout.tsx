import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Logo } from "@/components/brand/logo";
import { LayoutDashboard, Building2, Package, ScrollText, LogOut, LifeBuoy, ArrowRightLeft } from "lucide-react";
import { signOut } from "@/lib/actions/auth.actions";

const ADMIN_NAV = [
  { href: "/admin", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/admin/workspaces", label: "المولدات (Workspaces)", icon: Building2 },
  { href: "/admin/plans", label: "الباقات", icon: Package },
  { href: "/admin/support", label: "الدعم الفني", icon: LifeBuoy },
  { href: "/admin/audit", label: "سجل التدقيق", icon: ScrollText },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  const appUser = await db.user.findUnique({ where: { id: user.id } });

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-64 shrink-0 flex-col border-l bg-secondary text-secondary-foreground lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo className="[&_span]:text-white" />
        </div>
        <p className="px-5 pb-2 text-xs font-medium text-secondary-foreground/60">إدارة المنصة</p>
        <nav className="flex-1 space-y-1 px-3">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-secondary-foreground/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <p className="px-2 pb-2 text-xs text-secondary-foreground/60">{appUser?.fullName}</p>
          <Link
            href="/dashboard"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-secondary-foreground/80 hover:bg-white/10 hover:text-white"
          >
            <ArrowRightLeft className="h-[18px] w-[18px]" /> رجوع لمولدتي
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-secondary-foreground/80 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-[18px] w-[18px]" /> تسجيل الخروج
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden p-4 lg:p-6">{children}</main>
    </div>
  );
}
