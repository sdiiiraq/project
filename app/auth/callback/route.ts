import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && next) {
      return NextResponse.redirect(`${origin}${next}`);
    }

    if (!error && data.user) {
      const existing = await db.workspaceMember.findFirst({ where: { userId: data.user.id } });

      if (!existing) {
        const fullName =
          (data.user.user_metadata?.full_name as string | undefined) ??
          data.user.email?.split("@")[0] ??
          "مستخدم جديد";

        await db.$transaction(async (tx) => {
          await tx.user.upsert({
            where: { id: data.user.id },
            update: { fullName, email: data.user.email ?? undefined },
            create: { id: data.user.id, fullName, email: data.user.email ?? null },
          });

          const workspace = await tx.workspace.create({
            data: { name: "مولدتي", ownerId: data.user.id },
          });

          await tx.workspaceMember.create({
            data: { workspaceId: workspace.id, userId: data.user.id, role: "OWNER" },
          });

          await tx.generator.create({
            data: { workspaceId: workspace.id, name: "مولدتي", ownerName: fullName },
          });

          const starterPlan = await tx.platformPlan.findFirst({ where: { slug: "starter", isActive: true } });
          if (starterPlan) {
            const trialStart = new Date();
            const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);
            await tx.platformSubscription.create({
              data: {
                workspaceId: workspace.id,
                planId: starterPlan.id,
                status: "TRIAL",
                trialStart,
                trialEnd,
                price: starterPlan.price,
              },
            });
          }
        });

        return NextResponse.redirect(`${origin}/onboarding`);
      }

      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
