"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";
import { Sheet, SheetContent, SheetTitle, SheetClose } from "@/components/ui/sheet";

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const primary = [...items].filter((i) => i.mobilePriority).sort((a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99)).slice(0, 3);
  const rest = items.filter((i) => !primary.includes(i));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t bg-card px-2 lg:hidden">
      {primary.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-1.5 text-[11px] font-medium",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}

      <Sheet open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-1.5 text-[11px] font-medium text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          المزيد
        </button>
        <SheetContent side="bottom" className="pb-8">
          <SheetTitle>كل الأقسام</SheetTitle>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {rest.map((item) => {
              const Icon = item.icon;
              return (
                <SheetClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    className="flex flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                </SheetClose>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
