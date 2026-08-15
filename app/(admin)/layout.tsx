import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Logo } from "@/components/brand/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRightLeft, LogOut } from "lucide-react";
import { signOut } from "@/lib/actions/auth.actions";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-navigation";
import { MobileAdminNav } from "@/components/admin/mobile-admin-nav";
import { AdminNavLink } from "@/components/admin/admin-nav-link";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  const appUser = await db.user.findUnique({ where: { id: user.id } });

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <MobileAdminNav />

      <aside className="hidden w-64 shrink-0 flex-col border-e border-border bg-card lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <p className="px-6 pb-2 text-[11px] font-medium text-muted-foreground/70">إدارة المنصة</p>
        <nav className="flex-1 space-y-1 px-3">
          {ADMIN_NAV_ITEMS.map((item) => (
            <AdminNavLink key={item.href} item={item} />
          ))}
        </nav>
        <div className="flex flex-col gap-1 border-t border-border p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-secondary text-xs">{initials(appUser?.fullName ?? "") || "؟"}</AvatarFallback>
            </Avatar>
            <p className="truncate text-sm font-medium">{appUser?.fullName}</p>
          </div>
          <Link
            href="/dashboard"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <ArrowRightLeft className="h-[18px] w-[18px]" /> رجوع لمولدتي
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
