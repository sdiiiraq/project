import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { ImpersonationBanner } from "./impersonation-banner";
import { NAV_ITEMS } from "@/lib/navigation";
import { roleHasPermission } from "@/lib/rbac/access";
import type { PermissionKey } from "@/lib/rbac/permissions";

export function AppShell({
  permissions,
  workspaceId,
  workspaceName,
  userId,
  fullName,
  email,
  impersonating = false,
  isPlatformAdmin = false,
  children,
}: {
  permissions: ReadonlySet<PermissionKey>;
  workspaceId: string;
  workspaceName: string;
  userId: string;
  fullName: string;
  email?: string | null;
  impersonating?: boolean;
  isPlatformAdmin?: boolean;
  children: React.ReactNode;
}) {
  const items = NAV_ITEMS.filter(
    (item) => !item.permission || roleHasPermission(permissions, item.permission as PermissionKey),
  );

  return (
    <div className="flex min-h-svh flex-col">
      {impersonating && <ImpersonationBanner workspaceName={workspaceName} />}
      <div className="flex min-h-0 flex-1">
        <Sidebar items={items} fullName={fullName} email={email} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            workspaceName={workspaceName}
            fullName={fullName}
            email={email}
            workspaceId={workspaceId}
            userId={userId}
            isPlatformAdmin={isPlatformAdmin}
          />
          <main className="flex-1 overflow-x-hidden p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
        </div>
        <MobileNav items={items} />
      </div>
    </div>
  );
}
