import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/session";
import { getUserPrimaryWorkspaceId } from "@/lib/auth/workspace";

export default async function RootPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const workspaceId = await getUserPrimaryWorkspaceId(user.id);
  redirect(workspaceId ? "/dashboard" : "/onboarding");
}
