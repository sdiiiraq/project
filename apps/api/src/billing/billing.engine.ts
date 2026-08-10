import { Decimal } from '@prisma/client/runtime/library';

/**
 * محرك الفوترة (§18/§19): دالة حساب نقية وحتمية.
 * كل الحسابات عبر Decimal — لا floating point أبدًا (§77).
 * المدخلات والمخرجات نصوص لضمان الحتمية الكاملة وقابلية الاختبار (§83).
 */

export interface BillingConfig {
  /** التقريب لأعداد صحيحة (IQD بلا وحدات فرعية) */
  roundToInteger: boolean;
  roundingMode: 'HALF_UP' | 'DOWN';
  /** الحد الأدنى للاستحقاق */
  minimumCharge: string;
  /** تضمين الديون السابقة في الفاتورة الجديدة */
  includePreviousDebt: boolean;
  /** سياسة الفترة الجزئية: توزيع بالأيام أو كامل */
  partialPeriodPolicy: 'PRORATE' | 'FULL';
  /** أيام السماح بعد نهاية الفترة = تاريخ الاستحقاق */
  gracePeriodDays: number;
  /** غرامة تأخير تطبق عند وجود دين سابق */
  latePenalty: { enabled: boolean; type: 'FIXED' | 'PERCENTAGE'; value: string };
  /** عتبة الموافقة الإلزامية للتعديلات (§139) */
  adjustmentApprovalThreshold: string;
}

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  roundToInteger: true,
  roundingMode: 'HALF_UP',
  minimumCharge: '0',
  includePreviousDebt: true,
  partialPeriodPolicy: 'PRORATE',
  gracePeriodDays: 7,
  latePenalty: { enabled: false, type: 'FIXED', value: '0' },
  adjustmentApprovalThreshold: '25000',
};

export interface BillingSubscriptionInput {
  customPrice: string | null;
  customAmpere: string | null;
  discountType: 'FIXED' | 'PERCENTAGE' | null;
  discountValue: string | null;
  startDate: Date;
  endDate: Date | null;
}

export interface BillingInput {
  subscription: BillingSubscriptionInput;
  plan: { price: string; ampereAmount: string };
  periodStart: Date;
  periodEnd: Date;
  previousDebt: string;
  config: BillingConfig;
}

export interface BillingCalculation {
  baseCharge: string;
  discountAmount: string;
  penaltyAmount: string;
  previousDebt: string;
  creditApplied: string;
  totalAmount: string;
  activeDays: number;
  periodDays: number;
  appliedPartial: boolean;
}

export class BillingEngineError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BillingEngineError';
  }
}

function d(value: string | number | Decimal): Decimal {
  return new Decimal(value);
}

function roundMoney(value: Decimal, config: BillingConfig): Decimal {
  if (!config.roundToInteger) return value.toDecimalPlaces(3);
  const mode = config.roundingMode === 'DOWN' ? Decimal.ROUND_DOWN : Decimal.ROUND_HALF_UP;
  return value.toDecimalPlaces(0, mode);
}

/** عدد الأيام شاملًا الطرفين — حساب UTC صريح لتجنب الغموض (§78) */
export function dayCount(start: Date, end: Date): number {
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.round((e - s) / 86_400_000) + 1;
}

/**
 * المعادلة (§19):
 * الأساس + الغرامات + الديون السابقة − الخصم − الائتمان = الإجمالي المستحق
 */
export function calculateBill(input: BillingInput): BillingCalculation {
  const cfg = input.config;

  const periodDays = dayCount(input.periodStart, input.periodEnd);
  if (periodDays <= 0) throw new BillingEngineError('INVALID_PERIOD', 'فترة الفوترة غير صالحة');
  if (d(input.plan.ampereAmount).lte(0)) throw new BillingEngineError('INVALID_PLAN', 'قيمة الأمبير في الخطة غير صالحة');

  // الأيام الفعلية داخل الفترة (فترات جزئية §113-15/16)
  const activeStart = input.subscription.startDate > input.periodStart ? input.subscription.startDate : input.periodStart;
  const rawEnd = input.subscription.endDate ?? input.periodEnd;
  const activeEnd = rawEnd < input.periodEnd ? rawEnd : input.periodEnd;
  let activeDays = dayCount(activeStart, activeEnd);
  if (activeDays < 0) activeDays = 0;
  if (activeDays > periodDays) activeDays = periodDays;
  const appliedPartial = activeDays < periodDays && cfg.partialPeriodPolicy === 'PRORATE';

  // الأساس: سعر مخصص > أمبير مخصص × سعر الأمبير > سعر الخطة
  let base: Decimal;
  if (input.subscription.customPrice !== null && input.subscription.customPrice !== '') {
    base = d(input.subscription.customPrice);
  } else if (input.subscription.customAmpere !== null && input.subscription.customAmpere !== '') {
    const perAmpere = d(input.plan.price).div(d(input.plan.ampereAmount));
    base = perAmpere.mul(d(input.subscription.customAmpere));
  } else {
    base = d(input.plan.price);
  }

  if (appliedPartial) {
    base = base.mul(activeDays).div(periodDays);
  }

  const minimum = d(cfg.minimumCharge);
  if (base.lessThan(minimum)) base = minimum;
  base = roundMoney(base, cfg);

  // الخصم
  let discount = d(0);
  if (input.subscription.discountType === 'FIXED' && input.subscription.discountValue) {
    discount = d(input.subscription.discountValue);
  } else if (input.subscription.discountType === 'PERCENTAGE' && input.subscription.discountValue) {
    discount = base.mul(d(input.subscription.discountValue)).div(100);
  }
  discount = roundMoney(discount, cfg);
  if (discount.greaterThan(base)) discount = base;

  // الغرامة: تُطبق فقط عند وجود دين سابق محمول (سياسة قابلة للتكوين)
  const prevDebt = cfg.includePreviousDebt ? d(input.previousDebt) : d(0);
  let penalty = d(0);
  if (cfg.latePenalty.enabled && prevDebt.greaterThan(0)) {
    penalty =
      cfg.latePenalty.type === 'PERCENTAGE'
        ? base.mul(d(cfg.latePenalty.value)).div(100)
        : d(cfg.latePenalty.value);
    penalty = roundMoney(penalty, cfg);
  }

  // الائتمان يُطبق عبر التعديلات بعد الإصدار (توثيق تصميمي)
  const credit = d(0);

  let total = base.sub(discount).add(penalty).add(prevDebt).sub(credit);
  if (total.lessThan(0)) total = d(0);
  total = roundMoney(total, cfg);

  return {
    baseCharge: base.toFixed(),
    discountAmount: discount.toFixed(),
    penaltyAmount: penalty.toFixed(),
    previousDebt: prevDebt.toFixed(),
    creditApplied: credit.toFixed(),
    totalAmount: total.toFixed(),
    activeDays,
    periodDays,
    appliedPartial,
  };
}
