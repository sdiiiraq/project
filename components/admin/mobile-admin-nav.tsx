"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ArrowRightLeft, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-navigation";
import { ADMIN_ICON_MAP } from "./admin-icons";
import { Sheet, SheetContent, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/lib/actions/auth.actions";

export function MobileAdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur-md lg:hidden">
      <Logo />
      <Sheet open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60"
          aria-label="فتح قائمة الإدارة"
        >
          <Menu className="h-5 w-5" />
        </button>
        <SheetContent side="bottom" className="pb-8">
          <SheetTitle>إدارة المنصة</SheetTitle>
          <nav className="mt-4 flex flex-col gap-1">
            {ADMIN_NAV_ITEMS.map((item) => {
              const Icon = ADMIN_ICON_MAP[item.icon];
              const isActive = pathname === item.href;
              return (
                <SheetClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive ? "bg-primary/15 text-primary" : "text-foreground hover:bg-muted/60",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" /> {item.label}
                  </Link>
                </SheetClose>
              );
            })}
          </nav>
          <div className="mt-4 flex flex-col gap-1 border-t pt-4">
            <SheetClose asChild>
              <Link href="/dashboard" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60">
                <ArrowRightLeft className="h-[18px] w-[18px]" /> رجوع لمولدتي
              </Link>
            </SheetClose>
            <form action={signOut}>
              <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
                <LogOut className="h-[18px] w-[18px]" /> تسجيل الخروج
              </button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
