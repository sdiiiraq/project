import "server-only";
import type { PrismaClient } from "@prisma/client";

export function computeFuelConsumption(operatingHours: number, ratePerHour: number | null | undefined): number | null {
  if (ratePerHour === null || ratePerHour === undefined || ratePerHour <= 0) return null;
  if (operatingHours <= 0) return 0;
  return Math.round(operatingHours * ratePerHour * 100) / 100;
}

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

// يربط جلسة تشغيل بسجل استهلاك وقود واحد فقط (عبر operatingSessionId الفريد)،
// ويستبدل قيمته دائمًا بدل إضافته — يمنع الاحتساب المزدوج عند تعديل الجلسة أو إعادة تحميل الصفحة.
export async function syncSessionFuelUsage(
  tx: TxClient,
  params: { workspaceId: string; sessionId: string; operatingHours: number; date: Date; ratePerHour: number | null | undefined },
): Promise<void> {
  const consumedLiters = computeFuelConsumption(params.operatingHours, params.ratePerHour);

  if (consumedLiters === null) {
    // لا يوجد معدل استهلاك مضبوط بعد — لا نختلق استهلاكًا، ونحذف أي سجل تلقائي سابق إن وُجد
    // (حتى لا يبقى استهلاك محسوب بمعدل قديم بعد إزالة الإعداد).
    await tx.fuelUsage.deleteMany({ where: { operatingSessionId: params.sessionId } });
    return;
  }

  await tx.fuelUsage.upsert({
    where: { operatingSessionId: params.sessionId },
    update: { quantityLiters: consumedLiters, date: params.date },
    create: {
      workspaceId: params.workspaceId,
      operatingSessionId: params.sessionId,
      quantityLiters: consumedLiters,
      date: params.date,
      note: "استهلاك تلقائي — جلسة تشغيل",
    },
  });
}
