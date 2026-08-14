import { z } from "zod";
import { isEmail, isIraqiPhone } from "@/lib/utils/phone";

export const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, "أدخل البريد الإلكتروني أو رقم الهاتف")
    .refine((v) => isEmail(v) || isIraqiPhone(v), "البريد الإلكتروني أو رقم الهاتف غير صحيح"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});

const passwordSchema = z
  .string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل");

export const signupEmailSchema = z
  .object({
    fullName: z.string().min(2, "أدخل الاسم الكامل"),
    email: z.string().email("البريد الإلكتروني غير صحيح"),
    password: passwordSchema,
    confirmPassword: z.string(),
    generatorName: z.string().min(2, "أدخل اسم المولدة"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

export const signupPhoneSchema = z
  .object({
    fullName: z.string().min(2, "أدخل الاسم الكامل"),
    phone: z.string().refine(isIraqiPhone, "رقم الهاتف العراقي غير صحيح"),
    password: passwordSchema,
    confirmPassword: z.string(),
    generatorName: z.string().min(2, "أدخل اسم المولدة"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupEmailInput = z.infer<typeof signupEmailSchema>;
export type SignupPhoneInput = z.infer<typeof signupPhoneSchema>;
