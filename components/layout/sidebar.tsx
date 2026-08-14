import { Logo } from "@/components/brand/logo";
import { NavLink } from "./nav-link";
import type { NavItem } from "@/lib/navigation";

export function Sidebar({ items }: { items: NavItem[] }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l bg-card lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>
    </aside>
  );
}
