import Link from "next/link";
import { LoginForm } from "./login-form";
import { GoogleButton } from "@/components/auth/google-button";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">أهلًا بك في أمبير</h1>
        <p className="mt-1 text-sm text-muted-foreground">إدارة مولدتك أصبحت أبسط.</p>
      </div>

      <GoogleButton />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">أو</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <LoginForm />

      <p className="text-center text-sm text-muted-foreground">
        ليس لديك حساب؟{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          إنشاء حساب
        </Link>
      </p>
    </div>
  );
}
