import { z } from "zod";

export const customerStatusEnum = z.enum(["ACTIVE", "OVERDUE", "SUSPENDED", "DISCONNECTED"]);
export const customerTypeEnum = z.enum(["RESIDENTIAL", "COMMERCIAL", "NORMAL"]);
export const subscriptionTierEnum = z.enum(["NORMAL", "GOLD"]);

export const createCustomerSchema = z.object({
  name: z.string().min(2, "أدخل اسم المشترك"),
  phone: z.string().optional(),
  region: z.string().optional(),
  neighborhood: z.string().optional(),
  alley: z.string().optional(),
  houseNumber: z.string().optional(),
  notes: z.string().optional(),
  customerType: customerTypeEnum,
  tier: subscriptionTierEnum,
  amperes: z.coerce.number().int().positive("أدخل عدد الأمبيرات"),
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
  customerType: customerTypeEnum,
});

export const changeCustomerStatusSchema = z.object({
  id: z.string().uuid(),
  status: customerStatusEnum,
});

export const changeAmpereSchema = z.object({
  customerId: z.string().uuid(),
  amperes: z.coerce.number().int().positive("أدخل عدد الأمبيرات الجديد"),
  tier: subscriptionTierEnum,
  reason: z.string().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ChangeAmpereInput = z.infer<typeof changeAmpereSchema>;
