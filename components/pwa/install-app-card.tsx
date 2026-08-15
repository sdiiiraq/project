"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectIOS(): boolean {
  const ua = window.navigator.userAgent;
  const isIPhoneOrIPad = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ يُظهر Safari نفسه كـ Mac (Desktop UA) — نميّزه عبر نقاط اللمس.
  const isModernIPad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return (isIPhoneOrIPad || isModernIPad) && !("MSStream" in window);
}

function detectStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// زر تثبيت حقيقي: على Android/Chrome يستخدم beforeinstallprompt الفعلي، وعلى iOS يعرض
// تعليمات "إضافة إلى الشاشة الرئيسية" لأن Safari لا يوفّر Install Prompt برمجيًا.
export function InstallAppCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSSheet, setShowIOSSheet] = useState(false);

  useEffect(() => {
    setIsStandalone(detectStandalone());
    setIsIOS(detectIOS());

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDeferredPrompt(null);
      setIsStandalone(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (isStandalone) return null;
  if (!deferredPrompt && !isIOS) return null;

  async function handleInstallClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSSheet(true);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>تثبيت التطبيق</CardTitle>
          <CardDescription>ثبّت أمبير على جهازك لفتحه بسرعة كأي تطبيق، بدون متصفح.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleInstallClick}>
            <Download className="h-4 w-4" /> تثبيت التطبيق
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showIOSSheet} onOpenChange={setShowIOSSheet}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>لتثبيت أمبير على جهازك</DialogTitle>
          </DialogHeader>
          <ol className="list-decimal space-y-2 ps-5 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5">
              اضغط زر المشاركة <Share className="h-4 w-4 shrink-0" /> في Safari.
            </li>
            <li>اختر «إضافة إلى الشاشة الرئيسية».</li>
            <li>اضغط «إضافة».</li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
