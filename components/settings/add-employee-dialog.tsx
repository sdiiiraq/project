"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { addEmployeeSchema, type AddEmployeeInput } from "@/lib/validation/team";
import { addEmployee } from "@/lib/actions/team.actions";
import { PERMISSION_GROUPS, permissionLabel } from "@/lib/rbac/permission-groups";
import type { PermissionKey } from "@/lib/rbac/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export function AddEmployeeDialog({ actorPermissions }: { actorPermissions: PermissionKey[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<PermissionKey>>(new Set());
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddEmployeeInput>({ resolver: zodResolver(addEmployeeSchema), defaultValues: { permissions: [] } });

  const actorPermissionSet = new Set(actorPermissions);

  function toggle(key: PermissionKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onSubmit(values: AddEmployeeInput) {
    setLoading(true);
    const result = await addEmployee({ ...values, permissions: Array.from(selected) });
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تمت إضافة الموظف — شارك معه بيانات الدخول (البريد/الهاتف وكلمة المرور) بنفسك.");
    setOpen(false);
    setSelected(new Set());
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" /> إضافة موظف
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إضافة موظف جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex max-h-[75svh] flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employeeName">اسم الموظف</Label>
            <Input id="employeeName" {...register("fullName")} />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="employeeEmail">البريد الإلكتروني</Label>
              <Input id="employeeEmail" type="email" {...register("email")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="employeePhone">أو رقم الهاتف</Label>
              <Input id="employeePhone" dir="ltr" placeholder="07xxxxxxxxx" {...register("phone")} />
            </div>
          </div>
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employeePassword">كلمة مرور مبدئية</Label>
            <Input id="employeePassword" type="text" dir="ltr" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            <p className="text-xs text-muted-foreground">شارك هذه الكلمة مع الموظف مباشرة ليدخل بها لأول مرة.</p>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
            <p className="text-sm font-medium">الصلاحيات</p>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
                <div className="flex flex-col gap-1.5">
                  {group.keys.map((key) => {
                    const disabled = !actorPermissionSet.has(key);
                    return (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selected.has(key)}
                          disabled={disabled}
                          onCheckedChange={() => toggle(key)}
                        />
                        <span className={disabled ? "text-muted-foreground/50" : undefined}>{permissionLabel(key)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "جارٍ الإضافة..." : "إضافة الموظف"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
