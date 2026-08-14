"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  generatorNameSchema,
  generatorInfoSchema,
  amperePlansSchema,
  type GeneratorNameInput,
  type GeneratorInfoInput,
  type AmperePlansInput,
} from "@/lib/validation/onboarding";
import {
  updateGeneratorName,
  updateGeneratorInfo,
  saveAmperePlans,
  completeOnboarding,
} from "@/lib/actions/onboarding.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Logo } from "@/components/brand/logo";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";

const STEP_TITLES = ["اسم المولدة", "معلومات المولدة", "أسعار الأمبير", "أول مشترك", "جاهز"];

export function OnboardingWizard({
  workspaceName,
  generatorInfo,
  initialPlans,
}: {
  workspaceName: string;
  generatorInfo: { ownerName: string; phone: string; region: string; address: string };
  initialPlans: { amperes: number; monthlyPrice: number }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const progress = ((step + 1) / STEP_TITLES.length) * 100;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <Logo />
        <div className="w-full">
          <Progress value={progress} />
          <p className="mt-2 text-xs text-muted-foreground">
            الخطوة {step + 1} من {STEP_TITLES.length} — {STEP_TITLES[step]}
          </p>
        </div>
      </div>

      {step === 0 && <StepName defaultName={workspaceName} onNext={() => setStep(1)} />}
      {step === 1 && (
        <StepInfo defaultValues={generatorInfo} onBack={() => setStep(0)} onNext={() => setStep(2)} />
      )}
      {step === 2 && (
        <StepPricing defaultPlans={initialPlans} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}
      {step === 3 && <StepFirstCustomer onBack={() => setStep(2)} onNext={() => setStep(4)} />}
      {step === 4 && (
        <StepDone
          onFinish={async () => {
            await completeOnboarding();
            router.push("/dashboard");
          }}
        />
      )}
    </div>
  );
}

function StepName({ defaultName, onNext }: { defaultName: string; onNext: () => void }) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GeneratorNameInput>({
    resolver: zodResolver(generatorNameSchema),
    defaultValues: { name: defaultName === "مولدتي" ? "" : defaultName },
  });

  async function onSubmit(values: GeneratorNameInput) {
    setLoading(true);
    const result = await updateGeneratorName(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    onNext();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">ما اسم المولدة؟</Label>
        <Input id="name" placeholder="مثال: مولدة الأمل" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "جارٍ الحفظ..." : "متابعة"}
      </Button>
    </form>
  );
}

function StepInfo({
  defaultValues,
  onBack,
  onNext,
}: {
  defaultValues: GeneratorInfoInput;
  onBack: () => void;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GeneratorInfoInput>({ resolver: zodResolver(generatorInfoSchema), defaultValues });

  async function onSubmit(values: GeneratorInfoInput) {
    setLoading(true);
    const result = await updateGeneratorInfo(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    onNext();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ownerName">اسم صاحب المولدة</Label>
        <Input id="ownerName" {...register("ownerName")} />
        {errors.ownerName && <p className="text-xs text-destructive">{errors.ownerName.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">الهاتف</Label>
        <Input id="phone" dir="ltr" placeholder="07xxxxxxxxx" {...register("phone")} />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="region">المنطقة</Label>
        <Input id="region" {...register("region")} />
        {errors.region && <p className="text-xs text-destructive">{errors.region.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">العنوان (اختياري)</Label>
        <Input id="address" {...register("address")} />
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="outline" size="lg" onClick={onBack} className="flex-1">
          رجوع
        </Button>
        <Button type="submit" size="lg" disabled={loading} className="flex-1">
          {loading ? "جارٍ الحفظ..." : "متابعة"}
        </Button>
      </div>
    </form>
  );
}

function StepPricing({
  defaultPlans,
  onBack,
  onNext,
}: {
  defaultPlans: { amperes: number; monthlyPrice: number }[];
  onBack: () => void;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AmperePlansInput>({
    resolver: zodResolver(amperePlansSchema),
    defaultValues: {
      plans:
        defaultPlans.length > 0
          ? defaultPlans
          : [
              { amperes: 5, monthlyPrice: 50000 },
              { amperes: 10, monthlyPrice: 100000 },
            ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "plans" });

  async function onSubmit(values: AmperePlansInput) {
    setLoading(true);
    const result = await saveAmperePlans(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    onNext();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">حدد سعر كل باقة أمبير شهريًا. يمكنك تعديلها لاحقًا.</p>
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>الأمبير</Label>
              <Input type="number" {...register(`plans.${index}.amperes` as const)} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>السعر الشهري (د.ع)</Label>
              <Input type="number" {...register(`plans.${index}.monthlyPrice` as const)} />
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length === 1}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
      {errors.plans?.message && <p className="text-xs text-destructive">{errors.plans.message}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => append({ amperes: 15, monthlyPrice: 150000 })}
      >
        <Plus className="h-4 w-4" /> إضافة باقة
      </Button>
      <div className="flex gap-3">
        <Button type="button" variant="outline" size="lg" onClick={onBack} className="flex-1">
          رجوع
        </Button>
        <Button type="submit" size="lg" disabled={loading} className="flex-1">
          {loading ? "جارٍ الحفظ..." : "متابعة"}
        </Button>
      </div>
    </form>
  );
}

function StepFirstCustomer({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        يمكنك إضافة أول مشترك الآن، أو تخطي هذه الخطوة وإضافة المشتركين لاحقًا من صفحة «المشتركين».
      </p>
      <div className="flex gap-3">
        <Button type="button" variant="outline" size="lg" onClick={onBack} className="flex-1">
          رجوع
        </Button>
        <Button type="button" size="lg" onClick={onNext} className="flex-1">
          تخطي هذه الخطوة
        </Button>
      </div>
    </div>
  );
}

function StepDone({ onFinish }: { onFinish: () => void }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <CheckCircle2 className="h-12 w-12 text-success" />
      <h2 className="text-xl font-bold">مولدتك جاهزة.</h2>
      <p className="text-sm text-muted-foreground">
        تم تجهيز حسابك — ابدأ بإضافة المشتركين وتسجيل الجباية من لوحة التحكم.
      </p>
      <Button
        size="lg"
        className="w-full"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          await onFinish();
        }}
      >
        {loading ? "جارٍ التحميل..." : "الدخول إلى لوحة التحكم"}
      </Button>
    </div>
  );
}
