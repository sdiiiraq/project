import Link from "next/link";
import { SignupForm } from "./signup-form";
import { GoogleButton } from "@/components/auth/google-button";

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">إنشاء حساب جديد</h1>
        <p className="mt-1 text-sm text-muted-foreground">ابدأ بإدارة مولدتك رقميًا خلال دقائق.</p>
      </div>

      <GoogleButton />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">أو</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <SignupForm />

      <p className="text-center text-sm text-muted-foreground">
        لديك حساب مسبقًا؟{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
