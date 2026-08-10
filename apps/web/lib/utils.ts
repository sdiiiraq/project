import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** تنسيق المبلغ بالعراقي — القيم تصل محسوبة من الخادم (§147) */
export function formatIQD(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (Number.isNaN(n)) return '0';
  return `${n.toLocaleString('ar-IQ')} د.ع`;
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' });
}
