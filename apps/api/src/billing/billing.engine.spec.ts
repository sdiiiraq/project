import { BillingConfig, BillingInput, calculateBill, dayCount, DEFAULT_BILLING_CONFIG } from './billing.engine';

const period = { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-07-31T00:00:00Z') };

type InputOverrides = Partial<Omit<BillingInput, 'subscription' | 'plan' | 'config'>> & {
  subscription?: Partial<BillingInput['subscription']>;
  plan?: Partial<BillingInput['plan']>;
};

function input(overrides: InputOverrides = {}, configOverrides: Partial<BillingConfig> = {}): BillingInput {
  return {
    subscription: {
      customPrice: null,
      customAmpere: null,
      discountType: null,
      discountValue: null,
      startDate: new Date('2026-06-01T00:00:00Z'),
      endDate: null,
      ...overrides.subscription,
    },
    plan: { price: '100000', ampereAmount: '5', ...overrides.plan },
    periodStart: overrides.periodStart ?? period.start,
    periodEnd: overrides.periodEnd ?? period.end,
    previousDebt: overrides.previousDebt ?? '0',
    config: { ...DEFAULT_BILLING_CONFIG, ...configOverrides },
  };
}

describe('BillingEngine — calculateBill', () => {
  it('الرسوم الأساسية من سعر الخطة لشهر كامل', () => {
    const r = calculateBill(input());
    expect(r.baseCharge).toBe('100000');
    expect(r.totalAmount).toBe('100000');
    expect(r.activeDays).toBe(31);
    expect(r.periodDays).toBe(31);
    expect(r.appliedPartial).toBe(false);
  });

  it('السعر المخصص يتجاوز سعر الخطة', () => {
    const r = calculateBill(input({ subscription: { customPrice: '75000' } }));
    expect(r.baseCharge).toBe('75000');
    expect(r.totalAmount).toBe('75000');
  });

  it('الأمبير المخصص يضرب في سعر الأمبير حتمياً', () => {
    const r = calculateBill(input({ subscription: { customAmpere: '7' } }));
    // 100000 / 5 = 20000 × 7 = 140000
    expect(r.baseCharge).toBe('140000');
  });

  it('الفترة الجزئية توزع بالأيام (15 من 31)', () => {
    const r = calculateBill(input({ subscription: { startDate: new Date('2026-07-17T00:00:00Z') } }));
    // 100000 × 15 / 31 = 48387.09 → 48387 (HALF_UP)
    expect(r.activeDays).toBe(15);
    expect(r.appliedPartial).toBe(true);
    expect(r.baseCharge).toBe('48387');
  });

  it('سياسة FULL تتجاهل التوزيع', () => {
    const r = calculateBill(
      input({ subscription: { startDate: new Date('2026-07-17T00:00:00Z') } }),
      { partialPeriodPolicy: 'FULL' },
    );
    expect(r.baseCharge).toBe('100000');
  });

  it('خصم ثابت', () => {
    const r = calculateBill(input({ subscription: { discountType: 'FIXED', discountValue: '10000' } }));
    expect(r.discountAmount).toBe('10000');
    expect(r.totalAmount).toBe('90000');
  });

  it('خصم نسبي مع تقريب', () => {
    const r = calculateBill(input({ subscription: { discountType: 'PERCENTAGE', discountValue: '12.5' } }));
    expect(r.discountAmount).toBe('12500');
    expect(r.totalAmount).toBe('87500');
  });

  it('الخصم لا يتجاوز الأساس', () => {
    const r = calculateBill(input({ subscription: { discountType: 'FIXED', discountValue: '999999' } }));
    expect(r.discountAmount).toBe('100000');
    expect(r.totalAmount).toBe('0');
  });

  it('غرامة تأخير ثابتة عند وجود دين سابق', () => {
    const r = calculateBill(input({ previousDebt: '50000' }), { latePenalty: { enabled: true, type: 'FIXED', value: '5000' } });
    expect(r.penaltyAmount).toBe('5000');
    expect(r.totalAmount).toBe('155000'); // 100000 + 5000 + 50000
  });

  it('غرامة تأخير نسبية', () => {
    const r = calculateBill(input({ previousDebt: '50000' }), { latePenalty: { enabled: true, type: 'PERCENTAGE', value: '10' } });
    expect(r.penaltyAmount).toBe('10000');
  });

  it('لا غرامة بدون دين سابق', () => {
    const r = calculateBill(input(), { latePenalty: { enabled: true, type: 'FIXED', value: '5000' } });
    expect(r.penaltyAmount).toBe('0');
  });

  it('الدين السابق يُضمّن في الإجمالي', () => {
    const r = calculateBill(input({ previousDebt: '30000' }));
    expect(r.previousDebt).toBe('30000');
    expect(r.totalAmount).toBe('130000');
  });

  it('إلغاء تضمين الديون السابقة عبر الإعدادات', () => {
    const r = calculateBill(input({ previousDebt: '30000' }), { includePreviousDebt: false });
    expect(r.previousDebt).toBe('0');
    expect(r.totalAmount).toBe('100000');
  });

  it('الحد الأدنى للاستحقاق يُطبق بعد التوزيع', () => {
    const r = calculateBill(
      input({ subscription: { startDate: new Date('2026-07-30T00:00:00Z') } }),
      { minimumCharge: '25000' },
    );
    // يومان فقط: 100000×2/31=6451 → يرفع إلى 25000
    expect(r.baseCharge).toBe('25000');
  });

  it('الإجمالي لا يقل عن صفر', () => {
    const r = calculateBill(input({ subscription: { discountType: 'FIXED', discountValue: '100000' } }));
    expect(r.totalAmount).toBe('0');
  });

  it('حتمي: نفس المدخلات تعطي نفس المخرجات', () => {
    const a = calculateBill(input({ previousDebt: '12345' }));
    const b = calculateBill(input({ previousDebt: '12345' }));
    expect(a).toEqual(b);
  });

  it('dayCount شامل الطرفين', () => {
    expect(dayCount(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-31T00:00:00Z'))).toBe(31);
    expect(dayCount(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'))).toBe(1);
  });

  it('يرفض فترة غير صالحة', () => {
    expect(() => calculateBill(input({ periodStart: period.end, periodEnd: period.start }))).toThrow();
  });
});
