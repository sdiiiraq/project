"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { adminReplyTicketSchema, changeTicketStatusSchema } from "@/lib/validation/support";

export type ActionResult = { error: string } | { success: true };

export async function adminReplyTicket(input: unknown): Promise<ActionResult> {
  const parsed = adminReplyTicketSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const admin = await requirePlatformAdmin();
  const ticket = await db.supportTicket.findUnique({ where: { id: parsed.data.ticketId } });
  if (!ticket) return { error: "التذكرة غير موجودة." };

  await db.$transaction([
    db.supportMessage.create({
      data: {
        ticketId: ticket.id,
        authorUserId: admin.id,
        body: parsed.data.body,
        isInternalNote: parsed.data.isInternalNote,
      },
    }),
    db.supportTicket.update({
      where: { id: ticket.id },
      data: { status: parsed.data.isInternalNote ? ticket.status : "WAITING_FOR_USER" },
    }),
  ]);

  revalidatePath(`/admin/support/${ticket.id}`);
  return { success: true };
}

export async function changeTicketStatus(input: unknown): Promise<ActionResult> {
  const parsed = changeTicketStatusSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  await requirePlatformAdmin();
  const ticket = await db.supportTicket.findUnique({ where: { id: parsed.data.ticketId } });
  if (!ticket) return { error: "التذكرة غير موجودة." };

  await db.supportTicket.update({ where: { id: ticket.id }, data: { status: parsed.data.status } });

  revalidatePath(`/admin/support/${ticket.id}`);
  revalidatePath("/admin/support");
  return { success: true };
}
