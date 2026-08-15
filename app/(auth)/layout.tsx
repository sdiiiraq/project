import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Logo />
            <ThemeToggle />
          </div>
          {children}
        </div>
        <div className="mx-auto mt-8 hidden w-full max-w-sm justify-end lg:flex">
          <ThemeToggle />
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-secondary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, hsl(var(--primary) / 0.25), transparent 40%), radial-gradient(circle at 80% 70%, hsl(var(--brand-accent) / 0.18), transparent 45%)",
          }}
        />
        <Logo className="relative" />
        <div className="relative">
          <p className="text-2xl font-bold leading-relaxed text-secondary-foreground">
            إدارة مولدتك أصبحت أبسط.
          </p>
          <p className="mt-3 max-w-md text-secondary-foreground/70">
            الاشتراكات، الجباية، الوقود، والتقارير — كل شيء في مكان واحد، بلا دفاتر ولا حسابات يدوية.
          </p>
        </div>
      </div>
    </div>
  );
}
