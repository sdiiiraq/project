import { ValidationPipe } from '@nestjs/common';
import { NestApplication } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/response.interceptor';

/**
 * حالات الدفعات (§123): كامل، جزئي، تكرار، عكس، إفراط في الدفع.
 */
describe('Payments (e2e)', () => {
  let app: NestApplication;
  let token: string;
  let customerId: string;
  let billId: string;
  let billAmount: string;
  const randomPhone = () => `077${String(Math.floor(10000000 + Math.random() * 89999999))}`;

  async function setupBillableOrg() {
    const reg = await request(app.getHttpServer()).post('/auth/register')
      .send({ organizationName: 'منظمة الدفع', name: 'مالك', phone: randomPhone(), password: 'Test#Pass2026x' }).expect(201);
    const tk = reg.body.data.accessToken as string;

    const gen = await request(app.getHttpServer()).post('/generators').set('Authorization', `Bearer ${tk}`)
      .send({ name: 'مولدة الدفع' }).expect(201);
    const plan = await request(app.getHttpServer()).post('/plans').set('Authorization', `Bearer ${tk}`)
      .send({ generatorId: gen.body.data.id, name: '5 أمبير', ampereAmount: '5', price: '100000', effectiveFrom: '2026-01-01' }).expect(201);
    const cust = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${tk}`)
      .send({ generatorId: gen.body.data.id, fullName: 'مشترك الدفع', phonePrimary: randomPhone() }).expect(201);
    await request(app.getHttpServer()).post('/subscriptions').set('Authorization', `Bearer ${tk}`)
      .send({ customerId: cust.body.data.id, amperePlanId: plan.body.data.id, startDate: '2026-06-01' }).expect(201);
    await request(app.getHttpServer()).post('/bills/generate').set('Authorization', `Bearer ${tk}`)
      .send({ generatorId: gen.body.data.id, periodStart: '2026-06-01', periodEnd: '2026-06-30' }).expect(201);
    const bills = await request(app.getHttpServer()).get('/bills').set('Authorization', `Bearer ${tk}`)
      .query({ generatorId: gen.body.data.id }).expect(200);
    const bill = bills.body.data.items[0];
    await request(app.getHttpServer()).post(`/bills/${bill.id}/issue`).set('Authorization', `Bearer ${tk}`).expect(201);

    return { token: tk, customerId: cust.body.data.id as string, billId: bill.id as string, billAmount: bill.totalAmount as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    const ctx = await setupBillableOrg();
    token = ctx.token;
    customerId = ctx.customerId;
    billId = ctx.billId;
    billAmount = ctx.billAmount;
  });

  afterAll(async () => { await app.close(); });

  it('دفعة جزئية تحدّث الرصيد والحالة وتنشئ وصلاً', async () => {
    const res = await request(app.getHttpServer()).post('/payments').set('Authorization', `Bearer ${token}`)
      .send({ customerId, billId, amount: '40000', paymentMethod: 'CASH' }).expect(201);

    expect(res.body.data.payment.status).toBe('COMPLETED');
    expect(res.body.data.receipt).toBeDefined();
    expect(res.body.data.receipt.previousBalance).toBe(billAmount);

    const bill = await request(app.getHttpServer()).get(`/bills/${billId}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(bill.body.data.paidAmount).toBe('40000');
    expect(bill.body.data.outstandingAmount).toBe('60000');
    expect(bill.body.data.status).toBe('PARTIALLY_PAID');
  });

  it('منع التكرار عبر offlineTransactionId (§21)', async () => {
    const offlineId = `pay-${Date.now()}`;
    const first = await request(app.getHttpServer()).post('/payments').set('Authorization', `Bearer ${token}`)
      .send({ customerId, billId, amount: '10000', offlineTransactionId: offlineId }).expect(201);
    expect(first.body.data.deduplicated).toBe(false);

    const second = await request(app.getHttpServer()).post('/payments').set('Authorization', `Bearer ${token}`)
      .send({ customerId, billId, amount: '10000', offlineTransactionId: offlineId }).expect(201);
    expect(second.body.data.deduplicated).toBe(true);
    expect(second.body.data.payment.id).toBe(first.body.data.payment.id);
  });

  it('الإفراط في الدفع مرفوض (§113-5)', async () => {
    await request(app.getHttpServer()).post('/payments').set('Authorization', `Bearer ${token}`)
      .send({ customerId, billId, amount: '999999' }).expect(422);
  });

  it('سداد المتبقي يجعل الفاتورة PAID', async () => {
    await request(app.getHttpServer()).post('/payments').set('Authorization', `Bearer ${token}`)
      .send({ customerId, billId, amount: '50000' }).expect(201);

    const bill = await request(app.getHttpServer()).get(`/bills/${billId}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(bill.body.data.outstandingAmount).toBe('0');
    expect(bill.body.data.status).toBe('PAID');
  });

  it('العكس يعيد الأرصدة، والدفعة المعكوسة لا تُعكس مجددًا (§22/§113)', async () => {
    // أنشئ فاتورة جديدة عبر عميل/اشتراك جديدين لعكس دفعتها
    const cust2 = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${token}`)
      .send({ generatorId: (await request(app.getHttpServer()).get('/generators').set('Authorization', `Bearer ${token}`).expect(200)).body.data.items[0].id, fullName: 'مشترك العكس', phonePrimary: randomPhone() }).expect(201);
    // نستخدم فاتورة العميل الأول المدفوعة: نعكس آخر دفعة
    const payments = await request(app.getHttpServer()).get('/payments').set('Authorization', `Bearer ${token}`)
      .query({ customerId }).expect(200);
    const lastPayment = payments.body.data.items[0];
    expect(lastPayment.status).toBe('COMPLETED');

    await request(app.getHttpServer()).post(`/payments/${lastPayment.id}/reverse`).set('Authorization', `Bearer ${token}`)
      .send({ reason: 'عكس تجريبي' }).expect(200);

    const reversed = await request(app.getHttpServer()).get(`/payments/${lastPayment.id}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(reversed.body.data.status).toBe('REVERSED');

    // لا يمكن عكسها مجددًا
    await request(app.getHttpServer()).post(`/payments/${lastPayment.id}/reverse`).set('Authorization', `Bearer ${token}`)
      .send({ reason: 'محاولة ثانية' }).expect(422);

    // الرصيد أعيد للفاتورة
    const bill = await request(app.getHttpServer()).get(`/bills/${billId}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(Number(bill.body.data.outstandingAmount)).toBeGreaterThan(0);
  });
});
