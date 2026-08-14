"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { createTicketSchema, replyTicketSchema } from "@/lib/validation/support";

export type ActionResult = { error: string } | { success: true; ticketId?: string };

export async function createTicket(input: unknown): Promise<ActionResult> {
  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, user } = await requireWorkspace();

  const ticket = await db.supportTicket.create({
    data: {
      workspaceId: workspace.id,
      createdByUserId: user.id,
      category: parsed.data.category,
      subject: parsed.data.subject,
      description: parsed.data.description,
    },
  });

  revalidatePath("/support");
  return { success: true, ticketId: ticket.id };
}

export async function replyTicket(input: unknown): Promise<ActionResult> {
  const parsed = replyTicketSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, user } = await requireWorkspace();

  const ticket = await db.supportTicket.findFirst({ where: { id: parsed.data.ticketId, workspaceId: workspace.id } });
  if (!ticket) return { error: "التذكرة غير موجودة." };

  await db.$transaction([
    db.supportMessage.create({
      data: { ticketId: ticket.id, authorUserId: user.id, body: parsed.data.body },
    }),
    db.supportTicket.update({
      where: { id: ticket.id },
      data: { status: ticket.status === "WAITING_FOR_USER" ? "IN_PROGRESS" : ticket.status },
    }),
  ]);

  revalidatePath(`/support/${ticket.id}`);
  return { success: true };
}
