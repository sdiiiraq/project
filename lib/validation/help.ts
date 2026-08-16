import { z } from "zod";
import { isValidYouTubeUrl } from "@/lib/utils/youtube";

const youtubeUrlField = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((val) => !val || isValidYouTubeUrl(val), { message: "رابط يوتيوب غير صالح" });

export const upsertHelpGuideSchema = z.object({
  id: z.string().uuid().optional(),
  pageKey: z.string().min(1, "اختر الصفحة"),
  title: z.string().trim().min(2, "أدخل عنوان الشرح").max(200),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  mobileVideoUrl: youtubeUrlField,
  desktopVideoUrl: youtubeUrlField,
  enabled: z.boolean(),
});

export type UpsertHelpGuideInput = z.infer<typeof upsertHelpGuideSchema>;

export const toggleHelpGuideSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
});

export const deleteHelpGuideSchema = z.object({
  id: z.string().uuid(),
});
