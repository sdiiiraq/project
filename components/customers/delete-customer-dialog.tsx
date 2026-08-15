"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteCustomer } from "@/lib/actions/customer.actions";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteCustomerDialog({ customerId, customerName }: { customerId: string; customerName: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="outline" className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" /> حذف
          </Button>
        </DialogTrigger>
      }
      title={`حذف المشترك ${customerName}`}
      description="سيتم إيقاف اشتراك هذا المشترك ونقله إلى قائمة المقطوعين. سجله المالي (الفواتير والدفعات وتاريخ الأمبير) يبقى محفوظًا بالكامل ولن يُحذف. لا يمكن التراجع عن هذا الإجراء من هنا."
      confirmLabel="تأكيد الحذف"
      onConfirm={async () => {
        const result = await deleteCustomer(customerId);
        if (result && "success" in result) router.push("/customers");
        return result;
      }}
      successMessage="تم حذف المشترك"
    />
  );
}
