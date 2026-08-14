import { z } from "zod";

export const assignCollectorSchema = z.object({
  collectorUserId: z.string().uuid("اختر جابيًا"),
  customerId: z.string().uuid(),
});

export const unassignCollectorSchema = z.object({
  assignmentId: z.string().uuid(),
});

export const settleCollectorSchema = z.object({
  collectorUserId: z.string().uuid(),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  expectedAmount: z.coerce.number().min(0),
  actualAmount: z.coerce.number().min(0),
  notes: z.string().optional(),
});

export const createExpenseSchema = z.object({
  categoryId: z.string().uuid("اختر تصنيفًا"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  date: z.coerce.date(),
  vendor: z.string().optional(),
  note: z.string().optional(),
});

export const createFuelPurchaseSchema = z.object({
  quantityLiters: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  pricePerLiter: z.coerce.number().positive("السعر يجب أن يكون أكبر من صفر"),
  supplier: z.string().optional(),
  date: z.coerce.date(),
});

export const createFuelUsageSchema = z.object({
  quantityLiters: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  date: z.coerce.date(),
  note: z.string().optional(),
});

export const createEquipmentSchema = z.object({
  name: z.string().min(2, "أدخل اسم المعدة"),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
});

export const createMaintenanceSchema = z.object({
  equipmentId: z.string().uuid("اختر المعدة"),
  type: z.string().min(2, "أدخل نوع الصيانة"),
  date: z.coerce.date(),
  cost: z.coerce.number().min(0),
  parts: z.string().optional(),
  technician: z.string().optional(),
  notes: z.string().optional(),
  nextMaintenanceDate: z.coerce.date().optional(),
});

export const startOperatingSessionSchema = z.object({
  startTime: z.coerce.date().optional(),
});

export const endOperatingSessionSchema = z.object({
  sessionId: z.string().uuid(),
  downtimeMinutes: z.coerce.number().min(0).default(0),
  downtimeReason: z.string().optional(),
});

export type AssignCollectorInput = z.infer<typeof assignCollectorSchema>;
export type SettleCollectorInput = z.infer<typeof settleCollectorSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateFuelPurchaseInput = z.infer<typeof createFuelPurchaseSchema>;
export type CreateFuelUsageInput = z.infer<typeof createFuelUsageSchema>;
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
