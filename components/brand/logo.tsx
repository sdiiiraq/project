import { cn } from "@/lib/utils";
import { LogoMark } from "./logo-mark";

export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className="text-lg font-bold tracking-tight">أمبير</span>
          <span className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground">AMPERE</span>
        </div>
      )}
    </div>
  );
}
