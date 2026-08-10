import { ValidationPipe } from '@nestjs/common';
import { NestApplication } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/response.interceptor';

describe('Offline Sync (e2e)', () => {
  let app: NestApplication;
  let ownerToken: string;
  let collectorToken: string;
  let generatorId: string;
  let customerId: string;
  let customer2Id: string;
  let collectorId: string;
  let billId: string;

  const randomPhone = () => `077${String(Math.floor(10000000 + Math.random() * 89999999))}`;
  const password = 'Test#Pass2026x';

  const makeTx = (clientTransactionId: string, custId: string, amount?: string) => ({
    clientTransactionId,
    entityType: 'PAYMENT',
    payload: amount === undefined ? { customerId: custId } : { customerId: custId, amount, paymentMethod: 'CASH' },
    createdOfflineAt: new Date().toISOString(),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    const reg = await request(app.getHttpServer()).post('/auth/register')
      .send({ organizationName: 'منظمة المزامنة', name: 'مالك', phone: randomPhone(), password }).expect(201);
    ownerToken = reg.body.data.accessToken;

    const gen = await request(app.getHttpServer()).post('/generators').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'مولدة المزامنة' }).expect(201);
    generatorId = gen.body.data.id;

    const plan = await request(app.getHttpServer()).post('/plans').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, name: '5 أمبير', ampereAmount: '5', price: '100000', effectiveFrom: '2026-01-01' }).expect(201);

    const cust = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, fullName: 'مشترك المزامنة', phonePrimary: randomPhone() }).expect(201);
    customerId = cust.body.data.id;

    const cust2 = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, fullName: 'مشترك غير معين', phonePrimary: randomPhone() }).expect(201);
    customer2Id = cust2.body.data.id;

    await request(app.getHttpServer()).post('/subscriptions').set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerId, amperePlanId: plan.body.data.id, startDate: '2026-06-01' }).expect(201);
    await request(app.getHttpServer()).post('/bills/generate').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, periodStart: '2026-06-01', periodEnd: '2026-06-30' }).expect(201);
    const bills = await request(app.getHttpServer()).get('/bills').set('Authorization', `Bearer ${ownerToken}`)
      .query({ generatorId }).expect(200);
    billId = bills.body.data.items[0].id;
    await request(app.getHttpServer()).post(`/bills/${billId}/issue`).set('Authorization', `Bearer ${ownerToken}`).expect(201);

    const collectorPhone = randomPhone();
    await request(app.getHttpServer()).post('/users').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'جابي المزامنة', phone: collectorPhone, password, roleName: 'COLLECTOR' }).expect(201);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ phone: collectorPhone, password }).expect(201);
    collectorToken = login.body.data.accessToken;
    const collectorUserId = login.body.data.user.id;

    const collectorRes = await request(app.getHttpServer()).post('/collections/collectors')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: collectorUserId, name: 'جابي المزامنة' }).expect(201);
    collectorId = collectorRes.body.data.id;

    await request(app.getHttpServer()).post('/collections/assignments').set('Authorization', `Bearer ${ownerToken}`)
      .send({ collectorId, generatorId, customerId }).expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('دفعة أوفلاين تُزامن بنجاح (SYNCED)', async () => {
    const res = await request(app.getHttpServer()).post('/sync/push')
      .set('Authorization', `Bearer ${collectorToken}`)
      .send({ deviceId: 'device-1', transactions: [makeTx('offline-tx-1', customerId, '40000')] })
      .expect(200);
    expect(res.body.data.results[0].status).toBe('SYNCED');
    expect(res.body.data.results[0].serverEntityId).toBeDefined();
  });

  it('إعادة نفس clientTransactionId لا تكرر الدفعة (idempotent §26)', async () => {
    const again = await request(app.getHttpServer()).post('/sync/push')
      .set('Authorization', `Bearer ${collectorToken}`)
      .send({ deviceId: 'device-1', transactions: [makeTx('offline-tx-1', customerId, '40000')] })
      .expect(200);
    expect(again.body.data.results[0].status).toBe('SYNCED');

    const payments = await request(app.getHttpServer()).get('/payments')
      .set('Authorization', `Bearer ${ownerToken}`).query({ customerId }).expect(200);
    expect(payments.body.data.meta.total).toBe(1);
  });

  it('دفعة لمشترك غير معين للجابي → CONFLICT (§27)', async () => {
    const res = await request(app.getHttpServer()).post('/sync/push')
      .set('Authorization', `Bearer ${collectorToken}`)
      .send({ deviceId: 'device-1', transactions: [makeTx('offline-tx-2', customer2Id, '10000')] })
      .expect(200);
    expect(res.body.data.results[0].status).toBe('CONFLICT');
    expect(res.body.data.results[0].error).toBeDefined();
  });

  it('حمولة غير صالحة (بدون مبلغ) → FAILED', async () => {
    const res = await request(app.getHttpServer()).post('/sync/push')
      .set('Authorization', `Bearer ${collectorToken}`)
      .send({ deviceId: 'device-1', transactions: [makeTx('offline-tx-3', customerId)] })
      .expect(200);
    expect(res.body.data.results[0].status).toBe('FAILED');
  });

  it('السحب يعيد المشتركين المعينين والفواتير المفتوحة', async () => {
    const res = await request(app.getHttpServer()).get('/sync/pull')
      .set('Authorization', `Bearer ${collectorToken}`).expect(200);
    expect(res.body.data.customers.length).toBe(1);
    expect(res.body.data.customers[0].customerId).toBe(customerId);
    expect(Number(res.body.data.customers[0].outstandingBalance)).toBeGreaterThan(0);
    expect(res.body.data.openBills.length).toBeGreaterThan(0);
    expect(res.body.data.serverTime).toBeDefined();
  });

  it('حالة المزامنة تعكس النتائج', async () => {
    const res = await request(app.getHttpServer()).get('/sync/status')
      .set('Authorization', `Bearer ${collectorToken}`).expect(200);
    expect(res.body.data.synced).toBeGreaterThanOrEqual(1);
    expect(res.body.data.conflicts).toBeGreaterThanOrEqual(1);
    expect(res.body.data.failed).toBeGreaterThanOrEqual(1);
  });

  it('عزل المستأجرين: مستخدم بلا ملف جابٍ يُرفض من السحب', async () => {
    const reg2 = await request(app.getHttpServer()).post('/auth/register')
      .send({ organizationName: 'منظمة أخرى', name: 'مالك', phone: randomPhone(), password }).expect(201);
    await request(app.getHttpServer()).get('/sync/pull')
      .set('Authorization', `Bearer ${reg2.body.data.accessToken}`).expect(403);
  });
});
