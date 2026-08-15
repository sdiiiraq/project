"use client";

import { Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const DEFAULT_MESSAGE = "السلام عليكم، نذكركم بأن اشتراك المولدة لهذا الشهر مستحق. يرجى التسديد. شكراً.";

// روابط حقيقية تفتح تطبيقات الجهاز (اتصال/SMS/WhatsApp) — لا يوجد إرسال برمجي من السيرفر هنا.
function smsHref(phone: string, message: string) {
  return `sms:${phone}?&body=${encodeURIComponent(message)}`;
}
function whatsappHref(phone: string, message: string) {
  const digits = phone.replace(/[^\d]/g, "").replace(/^0/, "964");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function ContactActions({ phone }: { phone: string | null | undefined }) {
  if (!phone) return null;

  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="ghost" size="icon" title="اتصال">
        <a href={`tel:${phone}`} aria-label="اتصال">
          <Phone className="h-4 w-4" />
        </a>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" title="رسالة تذكير" aria-label="رسالة تذكير">
            <MessageCircle className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={whatsappHref(phone, DEFAULT_MESSAGE)} target="_blank" rel="noopener noreferrer">
              واتساب
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={smsHref(phone, DEFAULT_MESSAGE)}>SMS</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
