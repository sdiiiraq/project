import { z } from "zod";

export const customerStatusEnum = z.enum(["ACTIVE", "OVERDUE", "SUSPENDED", "DISCONNECTED"]);

export const createCustomerSchema = z.object({
  name: z.string().min(2, "أدخل اسم المشترك"),
  phone: z.string().optional(),
  region: z.string().optional(),
  neighborhood: z.string().optional(),
  alley: z.string().optional(),
  houseNumber: z.string().optional(),
  notes: z.string().optional(),
  amperePlanId: z.string().uuid("اختر باقة الأمبير"),
});

export const updateCustomerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2, "أدخل اسم المشترك"),
  phone: z.string().optional(),
  region: z.string().optional(),
  neighborhood: z.string().optional(),
  alley: z.string().optional(),
  houseNumber: z.string().optional(),
  notes: z.string().optional(),
});

export const changeCustomerStatusSchema = z.object({
  id: z.string().uuid(),
  status: customerStatusEnum,
});

export const changeAmpereSchema = z.object({
  customerId: z.string().uuid(),
  amperePlanId: z.string().uuid("اختر باقة الأمبير الجديدة"),
  reason: z.string().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ChangeAmpereInput = z.infer<typeof changeAmpereSchema>;
