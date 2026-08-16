import { z } from "zod";
import { isTripleName } from "@/lib/utils/name";

export const generatorNameSchema = z.object({
  name: z.string().min(2, "أدخل اسم المولدة"),
});

export const generatorInfoSchema = z.object({
  ownerName: z
    .string()
    .min(2, "أدخل الاسم الثلاثي لصاحب المولدة")
    .refine(isTripleName, "أدخل الاسم الثلاثي كاملًا (3 أسماء على الأقل)"),
  phone: z.string().min(1, "أدخل رقم الهاتف"),
  region: z.string().min(1, "أدخل المنطقة"),
  address: z.string().optional(),
});

export const pricePerAmpereSchema = z.object({
  normalAmperePriceIQD: z.coerce.number().int("السعر يجب أن يكون رقمًا صحيحًا بدون كسور").positive("السعر يجب أن يكون أكبر من صفر"),
  goldAmperePriceIQD: z.coerce.number().int("السعر يجب أن يكون رقمًا صحيحًا بدون كسور").positive("السعر يجب أن يكون أكبر من صفر"),
});

export type GeneratorNameInput = z.infer<typeof generatorNameSchema>;
export type GeneratorInfoInput = z.infer<typeof generatorInfoSchema>;
export type PricePerAmpereInput = z.infer<typeof pricePerAmpereSchema>;
