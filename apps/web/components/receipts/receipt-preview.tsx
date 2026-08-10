'use client';

import { Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/core';
import { MoneyDisplay } from '@/components/ui/status';

/**
 * معاينة الوصل (§28): اسم المنظمة، المولدة، رقم الوصل، المشترك، المبلغ،
 * طريقة الدفع، الفترة، الرصيد السابق/المتبقي، الجابي. دعم الطباعة والتنزيل.
 */
export interface ReceiptData {
  organizationName: string;
  generatorName: string;
  receiptNumber: string;
  customerName: string;
  customerNumber: string;
  dateTime: string;
  amount: string;
  paymentMethod: string;
  billingPeriod: string;
  previousBalance: string;
  remainingBalance: string;
  collectorName?: string;
  reference?: string;
  notes?: string;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'نقدًا', BANK_TRANSFER: 'تحويل مصرفي', CARD: 'بطاقة', ONLINE: 'إلكتروني', OTHER: 'أخرى',
};

export function ReceiptPreview({ receipt }: { receipt: ReceiptData }) {
  return (
    <div className="space-y-4">
      <div id="receipt-print-area" dir="rtl" className="mx-auto max-w-sm rounded-lg border-2 border-dashed p-6 text-sm">
        <div className="text-center">
          <h3 className="text-lg font-bold">{receipt.organizationName}</h3>
          <p className="text-muted-foreground">{receipt.generatorName}</p>
          <p className="mt-1 font-semibold">وصل استلام</p>
          <p className="text-xs text-muted-foreground">رقم الوصل: {receipt.receiptNumber}</p>
        </div>
        <div className="my-4 border-t" />
        <div className="space-y-1">
          <p><span className="text-muted-foreground">المشترك:</span> {receipt.customerName} ({receipt.customerNumber})</p>
          <p><span className="text-muted-foreground">التاريخ:</span> {new Date(receipt.dateTime).toLocaleString('ar-IQ')}</p>
          <p><span className="text-muted-foreground">طريقة الدفع:</span> {METHOD_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod}</p>
          <p><span className="text-muted-foreground">الفترة:</span> {receipt.billingPeriod}</p>
        </div>
        <div className="my-4 border-t" />
        <div className="space-y-1">
          <div className="flex justify-between"><span>المبلغ</span><MoneyDisplay amount={receipt.amount} /></div>
          <div className="flex justify-between"><span>الرصيد السابق</span><MoneyDisplay amount={receipt.previousBalance} /></div>
          <div className="flex justify-between font-bold"><span>الرصيد المتبقي</span><MoneyDisplay amount={receipt.remainingBalance} /></div>
        </div>
        {receipt.collectorName && <p className="mt-2 text-xs"><span className="text-muted-foreground">الجابي:</span> {receipt.collectorName}</p>}
        {receipt.reference && <p className="text-xs"><span className="text-muted-foreground">مرجع:</span> {receipt.reference}</p>}
        {receipt.notes && <p className="mt-2 text-xs text-muted-foreground">{receipt.notes}</p>}
        <div className="my-4 border-t" />
        <p className="text-center text-xs text-muted-foreground">شكرًا لكم</p>
      </div>
      <div className="flex justify-center gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</Button>
        <Button variant="outline" size="sm"><Download className="h-4 w-4" /> تنزيل PDF</Button>
      </div>
    </div>
  );
}
