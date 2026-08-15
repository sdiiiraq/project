"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  generatorNameSchema,
  generatorInfoSchema,
  pricePerAmpereSchema,
  type GeneratorNameInput,
  type GeneratorInfoInput,
  type PricePerAmpereInput,
} from "@/lib/validation/onboarding";
import {
  updateGeneratorName,
  updateGeneratorInfo,
  savePricePerAmpere,
  completeOnboarding,
} from "@/lib/actions/onboarding.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Logo } from "@/components/brand/logo";
import { CheckCircle2 } from "lucide-react";

const STEP_TITLES = ["اسم المولدة", "معلومات المولدة", "أسعار الأمبير", "أول مشترك", "جاهز"];

export function OnboardingWizard({
  workspaceName,
  generatorInfo,
  initialNormalPrice,
  initialGoldPrice,
}: {
  workspaceName: string;
  generatorInfo: { ownerName: string; phone: string; region: string; address: string };
  initialNormalPrice: number;
  initialGoldPrice: number;
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
        <StepPricing
          defaultNormalPrice={initialNormalPrice}
          defaultGoldPrice={initialGoldPrice}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
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
        <Label htmlFor="ownerName">الاسم الثلاثي لصاحب المولدة</Label>
        <Input id="ownerName" placeholder="مثال: أحمد محمد علي" {...register("ownerName")} />
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
  defaultNormalPrice,
  defaultGoldPrice,
  onBack,
  onNext,
}: {
  defaultNormalPrice: number;
  defaultGoldPrice: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PricePerAmpereInput>({
    resolver: zodResolver(pricePerAmpereSchema),
    defaultValues: {
      normalAmperePriceIQD: defaultNormalPrice > 0 ? defaultNormalPrice : 10000,
      goldAmperePriceIQD: defaultGoldPrice > 0 ? defaultGoldPrice : 12000,
    },
  });

  async function onSubmit(values: PricePerAmpereInput) {
    setLoading(true);
    const result = await savePricePerAmpere(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    onNext();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        حدد سعر الأمبير الواحد شهريًا لكل نوع اشتراك. عند إضافة مشترك تختار عدد الأمبيرات ونوع الاشتراك ويُحسب
        السعر تلقائيًا. يمكنك تعديل السعرين لاحقًا من الإعدادات.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="normalAmperePriceIQD">سعر الأمبير العادي شهريًا (د.ع)</Label>
        <Input id="normalAmperePriceIQD" type="number" min={1} inputMode="numeric" {...register("normalAmperePriceIQD")} />
        {errors.normalAmperePriceIQD && <p className="text-xs text-destructive">{errors.normalAmperePriceIQD.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="goldAmperePriceIQD">سعر الأمبير الذهبي شهريًا (د.ع)</Label>
        <Input id="goldAmperePriceIQD" type="number" min={1} inputMode="numeric" {...register("goldAmperePriceIQD")} />
        {errors.goldAmperePriceIQD && <p className="text-xs text-destructive">{errors.goldAmperePriceIQD.message}</p>}
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
      <h2 className="text-2xl font-bold tracking-tight md:text-3xl">مولدتك جاهزة.</h2>
      <p className="text-sm text-muted-foreground">
        تم تجهيز حسابك — ابدأ بإضافة المشتركين وتسجيل الدفعات من لوحة التحكم.
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
