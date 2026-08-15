import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { value: undefined, label: "الكل", key: "all" },
  { value: "paid", label: "دافع", key: "paid" },
  { value: "partial", label: "دافع قسم", key: "partial" },
  { value: "unpaid", label: "غير دافع", key: "unpaid" },
] as const;

export function PaymentStatusTabs({
  active,
  counts,
  basePath,
  searchParams,
}: {
  active?: string;
  counts: Record<string, number>;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  function hrefFor(value?: string) {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, val]) => {
      if (val && key !== "status" && key !== "page") params.set(key, val);
    });
    if (value) params.set("status", value);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const isActive = (active ?? undefined) === tab.value;
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/60",
            )}
          >
            {tab.label} ({counts[tab.key] ?? 0})
          </Link>
        );
      })}
    </div>
  );
}
