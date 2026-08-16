import { z } from "zod";

export const recordPaymentSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number().int("المبلغ يجب أن يكون رقمًا صحيحًا بدون كسور").positive("المبلغ يجب أن يكون أكبر من صفر"),
  date: z.coerce.date().optional(),
  method: z.string().default("CASH"),
  note: z.string().optional(),
});

export const adjustPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.coerce.number().int("المبلغ يجب أن يكون رقمًا صحيحًا بدون كسور").refine((v) => v !== 0, "قيمة التصحيح يجب ألا تساوي صفر"),
  reason: z.string().min(3, "أدخل سبب التصحيح"),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type AdjustPaymentInput = z.infer<typeof adjustPaymentSchema>;
