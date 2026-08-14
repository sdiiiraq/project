import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, role, impersonating } = await requireWorkspace();
  if (!workspace.onboardedAt && !impersonating) redirect("/onboarding");

  const appUser = await db.user.findUnique({ where: { id: user.id } });

  return (
    <AppShell
      role={role}
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      userId={user.id}
      fullName={appUser?.fullName ?? "مستخدم"}
      email={appUser?.email}
      impersonating={impersonating}
    >
      {children}
    </AppShell>
  );
}
