import { z } from "zod";
import { isEmail, isIraqiPhone } from "@/lib/utils/phone";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const permissionKeyEnum = z.enum(Object.keys(PERMISSIONS) as [string, ...string[]]);

export const addEmployeeSchema = z
  .object({
    fullName: z.string().min(2, "أدخل اسم الموظف"),
    email: z.string().optional(),
    phone: z.string().optional(),
    password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
    permissions: z.array(permissionKeyEnum).default([]),
  })
  .refine((data) => (data.email && isEmail(data.email)) || (data.phone && isIraqiPhone(data.phone)), {
    message: "أدخل بريدًا إلكترونيًا أو رقم هاتف عراقي صحيح",
    path: ["email"],
  });

export const updateEmployeePermissionsSchema = z.object({
  memberId: z.string().uuid(),
  permissions: z.array(permissionKeyEnum).default([]),
});

export const removeEmployeeSchema = z.object({
  memberId: z.string().uuid(),
});

export type AddEmployeeInput = z.infer<typeof addEmployeeSchema>;
export type UpdateEmployeePermissionsInput = z.infer<typeof updateEmployeePermissionsSchema>;
export type RemoveEmployeeInput = z.infer<typeof removeEmployeeSchema>;
