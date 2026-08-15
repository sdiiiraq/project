import { z } from "zod";

export const generatorNameSchema = z.object({
  name: z.string().min(2, "أدخل اسم المولدة"),
});

export const generatorInfoSchema = z.object({
  ownerName: z.string().min(2, "أدخل اسم صاحب المولدة"),
  phone: z.string().min(1, "أدخل رقم الهاتف"),
  region: z.string().min(1, "أدخل المنطقة"),
  address: z.string().optional(),
});

export const pricePerAmpereSchema = z.object({
  amperePriceIQD: z.coerce.number().positive("السعر يجب أن يكون أكبر من صفر"),
});

export type GeneratorNameInput = z.infer<typeof generatorNameSchema>;
export type GeneratorInfoInput = z.infer<typeof generatorInfoSchema>;
export type PricePerAmpereInput = z.infer<typeof pricePerAmpereSchema>;
