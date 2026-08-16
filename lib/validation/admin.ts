import { z } from "zod";

export const workspaceStatusEnum = z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]);

export const changeWorkspaceStatusSchema = z.object({
  workspaceId: z.string().uuid(),
  status: workspaceStatusEnum,
});

export const changeWorkspacePlanSchema = z.object({
  workspaceId: z.string().uuid(),
  planId: z.string().uuid(),
});

export const extendTrialSchema = z.object({
  workspaceId: z.string().uuid(),
  days: z.coerce.number().int().positive().max(365),
});

export const addBillingCreditSchema = z.object({
  workspaceId: z.string().uuid(),
  amount: z.coerce.number().int("المبلغ يجب أن يكون رقمًا صحيحًا بدون كسور").positive(),
  note: z.string().optional(),
});

export const setFeatureOverrideSchema = z.object({
  workspaceId: z.string().uuid(),
  featureKey: z.string().min(1),
  enabled: z.boolean(),
  reason: z.string().optional(),
});

export const upsertPlanSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(2),
  name: z.string().min(2),
  price: z.coerce.number().int("السعر يجب أن يكون رقمًا صحيحًا بدون كسور").min(0),
  customerLimit: z.coerce.number().int().positive().optional().nullable(),
  userLimit: z.coerce.number().int().positive().optional().nullable(),
});

export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;
export type AddBillingCreditInput = z.infer<typeof addBillingCreditSchema>;
export type UpsertPlanInput = z.infer<typeof upsertPlanSchema>;
