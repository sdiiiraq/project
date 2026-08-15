import { cn } from "@/lib/utils";

// علامة أمبير — ملف الشعار الأصلي المرفوع من المستخدم، بدون أي إعادة رسم أو تعديل على المحتوى.
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.jpg"
      alt="أمبير"
      className={cn("h-8 w-8 rounded-lg object-contain", className)}
    />
  );
}
