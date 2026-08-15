import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NavLink } from "./nav-link";
import type { NavItem } from "@/lib/navigation";
import { signOut } from "@/lib/actions/auth.actions";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function Sidebar({ items, fullName, email }: { items: NavItem[]; fullName: string; email?: string | null }) {
  const groups = new Map<string, NavItem[]>();
  for (const item of items) {
    const key = item.group ?? "عام";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-e border-border bg-card lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {[...groups.entries()].map(([group, groupItems]) => (
          <div key={group} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[11px] font-medium text-muted-foreground/70">{group}</p>
            {groupItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-3 border-t border-border p-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-secondary text-xs">{initials(fullName) || "؟"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{fullName}</p>
          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="تسجيل الخروج"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
