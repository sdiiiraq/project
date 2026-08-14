import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const { workspace } = await requireWorkspace();
  if (workspace.onboardedAt) redirect("/dashboard");

  const generator = await db.generator.findFirst({ where: { workspaceId: workspace.id } });
  const amperePlans = await db.amperePlan.findMany({
    where: { workspaceId: workspace.id, isCustom: false },
    orderBy: { amperes: "asc" },
  });

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center px-6 py-10">
      <OnboardingWizard
        workspaceName={workspace.name}
        generatorInfo={{
          ownerName: generator?.ownerName ?? "",
          phone: generator?.phone ?? "",
          region: generator?.region ?? workspace.region ?? "",
          address: generator?.address ?? workspace.address ?? "",
        }}
        initialPlans={amperePlans.map((p) => ({ amperes: p.amperes, monthlyPrice: Number(p.monthlyPrice) }))}
      />
    </div>
  );
}
