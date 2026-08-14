"use client";

import { LogOut, Settings, ShieldCheck, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export function UserMenu({
  fullName,
  email,
  isPlatformAdmin = false,
}: {
  fullName: string;
  email?: string | null;
  isPlatformAdmin?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none">
        <Avatar>
          <AvatarFallback>{initials(fullName) || <UserIcon className="h-4 w-4" />}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">{fullName}</span>
            {email && <span className="text-xs text-muted-foreground">{email}</span>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isPlatformAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin" className="font-medium text-primary focus:text-primary">
              <ShieldCheck className="h-4 w-4" /> لوحة إدارة المنصة
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" /> الإعدادات
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <button type="submit" className="w-full">
            <DropdownMenuItem asChild={false} className="text-destructive">
              <LogOut className="h-4 w-4" /> تسجيل الخروج
            </DropdownMenuItem>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
