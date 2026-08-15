import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-4 text-center text-foreground">
      <FileQuestion className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-xl font-bold">الصفحة غير موجودة</h1>
      <p className="text-sm text-muted-foreground">الرابط الذي فتحته غير صحيح أو تم نقله.</p>
      <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
        العودة إلى الرئيسية
      </Link>
    </div>
  );
}
