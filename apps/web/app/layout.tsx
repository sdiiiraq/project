import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'نظام إدارة المولدات',
  description: 'منصة SaaS لإدارة المولدات الأهلية في العراق',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // العربية افتراضية وRTL أولوية (§99)
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
