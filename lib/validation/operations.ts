import { z } from "zod";

export const createExpenseSchema = z.object({
  categoryId: z.string().uuid("اختر تصنيفًا"),
  amount: z.coerce.number().int("المبلغ يجب أن يكون رقمًا صحيحًا بدون كسور").positive("المبلغ يجب أن يكون أكبر من صفر"),
  date: z.coerce.date(),
  vendor: z.string().optional(),
  note: z.string().optional(),
});

export const createFuelPurchaseSchema = z.object({
  quantityLiters: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  pricePerLiter: z.coerce.number().int("السعر يجب أن يكون رقمًا صحيحًا بدون كسور").positive("السعر يجب أن يكون أكبر من صفر"),
  supplier: z.string().optional(),
  date: z.coerce.date(),
});

export const updateFuelPurchaseSchema = createFuelPurchaseSchema.extend({
  id: z.string().uuid(),
});

export const deleteFuelPurchaseSchema = z.object({ id: z.string().uuid() });

export const createFuelUsageSchema = z.object({
  quantityLiters: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  date: z.coerce.date(),
  note: z.string().optional(),
});

export const updateFuelUsageSchema = createFuelUsageSchema.extend({
  id: z.string().uuid(),
});

export const deleteFuelUsageSchema = z.object({ id: z.string().uuid() });

export const createEquipmentSchema = z.object({
  name: z.string().min(2, "أدخل اسم المعدة"),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
});

export const createMaintenanceSchema = z.object({
  equipmentId: z.string().uuid("اختر المعدة"),
  type: z.string().min(2, "أدخل نوع الصيانة"),
  date: z.coerce.date(),
  cost: z.coerce.number().int("التكلفة يجب أن تكون رقمًا صحيحًا بدون كسور").min(0),
  parts: z.string().optional(),
  technician: z.string().optional(),
  notes: z.string().optional(),
  nextMaintenanceDate: z.coerce.date().optional(),
});

export const deleteMaintenanceRecordSchema = z.object({ id: z.string().uuid() });

export const startOperatingSessionSchema = z.object({
  startTime: z.coerce.date().optional(),
});

export const endOperatingSessionSchema = z.object({
  sessionId: z.string().uuid(),
  downtimeMinutes: z.coerce.number().min(0).default(0),
  downtimeReason: z.string().optional(),
});

export const updateOperatingSessionSchema = z
  .object({
    sessionId: z.string().uuid(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    downtimeMinutes: z.coerce.number().min(0).default(0),
    downtimeReason: z.string().optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "وقت الانتهاء يجب أن يكون بعد وقت البدء",
    path: ["endTime"],
  });

export const updateFuelConsumptionRateSchema = z.object({
  fuelConsumptionPerHour: z.coerce.number().positive("المعدل يجب أن يكون أكبر من صفر"),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateFuelPurchaseInput = z.infer<typeof createFuelPurchaseSchema>;
export type UpdateFuelPurchaseInput = z.infer<typeof updateFuelPurchaseSchema>;
export type CreateFuelUsageInput = z.infer<typeof createFuelUsageSchema>;
export type UpdateFuelUsageInput = z.infer<typeof updateFuelUsageSchema>;
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type DeleteMaintenanceRecordInput = z.infer<typeof deleteMaintenanceRecordSchema>;
export type UpdateOperatingSessionInput = z.infer<typeof updateOperatingSessionSchema>;
export type UpdateFuelConsumptionRateInput = z.infer<typeof updateFuelConsumptionRateSchema>;
