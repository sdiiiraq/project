import { cn } from "@/lib/utils";

// علامة أمبير: حرف A هندسي مجرّد مستوحى من مؤشر عداد الأمبير — بدون رموز كهربائية مبتذلة.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("h-8 w-8", className)}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ampere-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1c2333" />
          <stop offset="1" stopColor="#0e1220" />
        </linearGradient>
        <linearGradient id="ampere-stroke" x1="16" y1="46" x2="48" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#ampere-bg)" />
      <path
        d="M20 46 L32 17 L44 46"
        fill="none"
        stroke="url(#ampere-stroke)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="24.5" y1="35" x2="39.5" y2="35" stroke="url(#ampere-stroke)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
