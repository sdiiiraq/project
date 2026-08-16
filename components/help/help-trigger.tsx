"use client";

import { useEffect, useState } from "react";
import { HelpCircle, X, Smartphone, Monitor, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { youtubeThumbnailUrl, youtubeEmbedUrl } from "@/lib/utils/youtube";

type Guide = {
  id: string;
  title: string;
  description: string | null;
  mobileVideoId: string | null;
  desktopVideoId: string | null;
};

type Device = "mobile" | "desktop";

const DEVICE_KEY = "ampere-help-device";
const seenKey = (pageKey: string) => `ampere-help-seen:${pageKey}`;
const hiddenKey = (pageKey: string) => `ampere-help-hidden:${pageKey}`;

// شارة "هل الجهاز الحالي جوال؟" لاختيار الفيديو الافتراضي عند أول زيارة (قبل أن يحفظ المستخدم تفضيله).
function guessDevice(): Device {
  if (typeof window === "undefined") return "desktop";
  return window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
}

export function HelpTrigger({ pageKey, guide }: { pageKey: string; guide: Guide | null }) {
  const [open, setOpen] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [playing, setPlaying] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!guide) return;
    const storedDevice = localStorage.getItem(DEVICE_KEY) as Device | null;
    setDevice(storedDevice === "mobile" || storedDevice === "desktop" ? storedDevice : guessDevice());

    const seen = localStorage.getItem(seenKey(pageKey));
    const hidden = localStorage.getItem(hiddenKey(pageKey));
    if (!seen && !hidden) setShowBanner(true);
    localStorage.setItem(seenKey(pageKey), "1");
  }, [pageKey, guide]);

  if (!guide) return null;

  function chooseDevice(d: Device) {
    setDevice(d);
    setPlaying(false);
    localStorage.setItem(DEVICE_KEY, d);
  }

  function openModal() {
    setShowBanner(false);
    setOpen(true);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setPlaying(false);
      if (dontShowAgain) localStorage.setItem(hiddenKey(pageKey), "1");
    }
  }

  const activeVideoId = device === "mobile" ? guide.mobileVideoId : guide.desktopVideoId;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openModal} className="gap-1.5">
        <HelpCircle className="h-4 w-4" /> مساعدة
      </Button>

      {showBanner && (
        <div className="fixed inset-x-4 bottom-20 z-40 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-popover p-3 shadow-premium-lg sm:inset-x-auto sm:bottom-6 sm:end-6 sm:max-w-sm">
          <button type="button" onClick={openModal} className="flex-1 text-start text-sm">
            💡 تحتاج مساعدة؟ شاهد شرح استخدام هذه الصفحة
          </button>
          <button type="button" onClick={() => setShowBanner(false)} aria-label="إغلاق" className="shrink-0 text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>كيف تستخدم هذه الصفحة؟</DialogTitle>
            {guide.description && <DialogDescription>{guide.description}</DialogDescription>}
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium">{guide.title}</p>

            <div className="flex gap-2">
              <Button
                type="button"
                variant={device === "mobile" ? "default" : "outline"}
                className="flex-1"
                onClick={() => chooseDevice("mobile")}
              >
                <Smartphone className="h-4 w-4" /> جوال
              </Button>
              <Button
                type="button"
                variant={device === "desktop" ? "default" : "outline"}
                className="flex-1"
                onClick={() => chooseDevice("desktop")}
              >
                <Monitor className="h-4 w-4" /> كمبيوتر
              </Button>
            </div>

            {activeVideoId ? (
              <div className="overflow-hidden rounded-xl border border-border">
                {playing ? (
                  <div className="aspect-video w-full">
                    <iframe
                      src={youtubeEmbedUrl(activeVideoId)}
                      title={guide.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full"
                    />
                  </div>
                ) : (
                  <button type="button" onClick={() => setPlaying(true)} className="group relative block aspect-video w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={youtubeThumbnailUrl(activeVideoId)} alt={guide.title} className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/40">
                      <span className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-black">
                        <Play className="h-4 w-4" /> مشاهدة الشرح
                      </span>
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                لا يوجد فيديو لهذا الجهاز بعد.
              </p>
            )}

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={dontShowAgain} onCheckedChange={(v) => setDontShowAgain(Boolean(v))} />
              عدم إظهار هذا الشرح مرة أخرى
            </label>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
