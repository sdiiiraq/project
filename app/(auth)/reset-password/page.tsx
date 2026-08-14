import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">تعيين كلمة مرور جديدة</h1>
        <p className="mt-1 text-sm text-muted-foreground">اختر كلمة مرور قوية لحسابك.</p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}
