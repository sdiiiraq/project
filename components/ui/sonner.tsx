"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      dir="rtl"
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            "font-sans rounded-2xl border border-border bg-popover text-popover-foreground shadow-premium-lg",
          title: "text-sm font-semibold",
          description: "text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-muted !text-muted-foreground",
          success: "!border-success/30",
          error: "!border-destructive/30",
          warning: "!border-warning/30",
        },
      }}
    />
  );
}
