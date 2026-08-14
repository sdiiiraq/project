import { z } from "zod";

export const createTicketSchema = z.object({
  category: z.string().min(1, "اختر التصنيف"),
  subject: z.string().min(3, "أدخل عنوان المشكلة"),
  description: z.string().min(10, "اشرح المشكلة بتفصيل أكبر"),
});

export const replyTicketSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().min(1, "أدخل الرد"),
});

export const ticketStatusEnum = z.enum(["OPEN", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"]);

export const changeTicketStatusSchema = z.object({
  ticketId: z.string().uuid(),
  status: ticketStatusEnum,
});

export const adminReplyTicketSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().min(1, "أدخل الرد"),
  isInternalNote: z.boolean().default(false),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type ReplyTicketInput = z.infer<typeof replyTicketSchema>;
