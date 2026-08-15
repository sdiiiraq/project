const BAGHDAD_TZ = "Asia/Baghdad";

// نستخدم توقيت بغداد صراحة بدل توقيت خادم Vercel (UTC) لتفادي انزياح التاريخ بالعرض قرب منتصف الليل.
function baghdadParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BAGHDAD_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    period: get("dayPeriod") === "AM" ? "ص" : get("dayPeriod") === "PM" ? "م" : get("dayPeriod"),
  };
}

// تنسيق تاريخ رقمي موحّد لكامل التطبيق — رقم الشهر فقط، بدون اسم الشهر: 2026/8/15
export function formatDate(date: Date): string {
  const { year, month, day } = baghdadParts(date);
  return `${year}/${month}/${day}`;
}

// تاريخ + وقت: 2026/8/15 6:30 م
export function formatDateTime(date: Date): string {
  const { year, month, day, hour, minute, period } = baghdadParts(date);
  return `${year}/${month}/${day} ${hour}:${minute} ${period}`;
}

// وقت فقط: 6:30 م
export function formatTime(date: Date): string {
  const { hour, minute, period } = baghdadParts(date);
  return `${hour}:${minute} ${period}`;
}

// تسمية شهر رقمية للفترات/الرسوم البيانية: شهر 8
export function formatMonthLabel(month: number): string {
  return `شهر ${month}`;
}
