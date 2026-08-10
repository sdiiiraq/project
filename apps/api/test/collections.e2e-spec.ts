import { ValidationPipe } from '@nestjs/common';
import { NestApplication } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/response.interceptor';

/**
 * التحصيل (§123/§164/§165): قيود الجابي، تسجيل دفعة، المطابقة (تسليم/مطابقة/اعتماد)،
 * ومنع وصول جابٍ لمشتركي جابٍ آخر.
 */
describe('Collections & Reconciliation (e2e)', () => {
  let app: NestApplication;
  let ownerToken: string;
  let collectorToken: string;
  let otherCollectorToken: string;
  let generatorId: string;
  let customerId: string;
  let collectorId: string;

  const randomPhone = () => `077${String(Math.floor(10000000 + Math.random() * 89999999))}`;
  const password = 'Test#Pass2026x';

  async function createUserWithRole(tk: string, roleName: string, name: string): Promise<string> {
    const phone = randomPhone();
    await request(app.getHttpServer()).post('/users').set('Authorization', `Bearer ${tk}`)
      .send({ name, phone, password, roleName }).expect(201);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ phone, password }).expect(201);
    return login.body.data.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    // منظمة + مولدة + خطة + مشترك + اشتراك + فاتورة مصدرة
    const reg = await request(app.getHttpServer()).post('/auth/register')
      .send({ organizationName: 'منظمة التحصيل', name: 'مالك', phone: randomPhone(), password }).expect(201);
    ownerToken = reg.body.data.accessToken;

    const gen = await request(app.getHttpServer()).post('/generators').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'مولدة التحصيل' }).expect(201);
    generatorId = gen.body.data.id;

    const plan = await request(app.getHttpServer()).post('/plans').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, name: '5 أمبير', ampereAmount: '5', price: '100000', effectiveFrom: '2026-01-01' }).expect(201);
    const cust = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, fullName: 'مشترك التحصيل', phonePrimary: randomPhone() }).expect(201);
    customerId = cust.body.data.id;
    await request(app.getHttpServer()).post('/subscriptions').set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerId, amperePlanId: plan.body.data.id, startDate: '2026-06-01' }).expect(201);
    await request(app.getHttpServer()).post('/bills/generate').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, periodStart: '2026-06-01', periodEnd: '2026-06-30' }).expect(201);
    const bills = await request(app.getHttpServer()).get('/bills').set('Authorization', `Bearer ${ownerToken}`)
      .query({ generatorId }).expect(200);
    await request(app.getHttpServer()).post(`/bills/${bills.body.data.items[0].id}/issue`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(201);

    // جابٍ مرتبط بمستخدم + تعيين المشترك له
    collectorToken = await createUserWithRole(ownerToken, 'COLLECTOR', 'الجابي الأول');
    const meRes = await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${collectorToken}`).expect(200);
    const collectorUserId = meRes.body.data.user.id;
    const collectorRes = await request(app.getHttpServer()).post('/collections/collectors')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: collectorUserId, name: 'الجابي الأول' }).expect(201);
    collectorId = collectorRes.body.data.id;
    await request(app.getHttpServer()).post('/collections/assignments').set('Authorization', `Bearer ${ownerToken}`)
      .send({ collectorId, generatorId, customerId }).expect(201);

    // جابٍ ثانٍ (غير معين لهذا المشترك)
    otherCollectorToken = await createUserWithRole(ownerToken, 'COLLECTOR', 'الجابي الثاني');
    const otherMe = await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${otherCollectorToken}`).expect(200);
    await request(app.getHttpServer()).post('/collections/collectors')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherMe.body.data.user.id, name: 'الجابي الثاني' }).expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('الجابي يرى فقط مشتركيه المعينين في my-customers', async () => {
    const res = await request(app.getHttpServer()).get('/collections/my-customers')
      .set('Authorization', `Bearer ${collectorToken}`).expect(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].customerId).toBe(customerId);
    expect(Number(res.body.data[0].outstandingBalance)).toBeGreaterThan(0);
  });

  it('جابٍ آخر لا يرى المشترك لأنه غير معين له', async () => {
    const res = await request(app.getHttpServer()).get('/collections/my-customers')
      .set('Authorization', `Bearer ${otherCollectorToken}`).expect(200);
    expect(res.body.data.length).toBe(0);
  });

  it('الجابي لا يستطيع تسجيل دفعة لمشترك غير معين له', async () => {
    await request(app.getHttpServer()).post('/collections/payment')
      .set('Authorization', `Bearer ${otherCollectorToken}`)
      .send({ customerId, amount: '10000' }).expect(403);
  });

  it('الجابي يسجل دفعة وتُربط بجلسة، ويتحدث رصيد المشترك', async () => {
    const res = await request(app.getHttpServer()).post('/collections/payment')
      .set('Authorization', `Bearer ${collectorToken}`)
      .send({ customerId, amount: '40000', paymentMethod: 'CASH' }).expect(201);
    expect(res.body.data.payment.status).toBe('COMPLETED');
    expect(res.body.data.sessionId).toBeDefined();

    const after = await request(app.getHttpServer()).get('/collections/my-customers')
      .set('Authorization', `Bearer ${collectorToken}`).expect(200);
    expect(Number(after.body.data[0].outstandingBalance)).toBe(60000);
  });

  it('دورة المطابقة: تسليم → مطابقة → اعتماد', async () => {
    const sessions = await request(app.getHttpServer()).get('/collections/sessions')
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const session = sessions.body.data.items.find((s: { status: string }) => s.status === 'OPEN');
    expect(session).toBeDefined();

    // التسليم من الجابي صاحب الجلسة فقط
    await request(app.getHttpServer()).post(`/collections/sessions/${session.id}/submit`)
      .set('Authorization', `Bearer ${collectorToken}`)
      .send({ cashSubmitted: '40000' }).expect(200);

    const submitted = await request(app.getHttpServer()).get('/collections/sessions')
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const sub = submitted.body.data.items.find((s: { id: string }) => s.id === session.id);
    expect(sub.status).toBe('SUBMITTED');
    expect(sub.difference).toBe('0');

    // المطابقة من المدير
    await request(app.getHttpServer()).post(`/collections/sessions/${session.id}/reconcile`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ outcome: 'RECONCILED' }).expect(200);

    // الاعتماد
    await request(app.getHttpServer()).post(`/collections/sessions/${session.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);

    const final = await request(app.getHttpServer()).get('/collections/sessions')
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const done = final.body.data.items.find((s: { id: string }) => s.id === session.id);
    expect(done.status).toBe('APPROVED');
  });

  it('الجابي لا يستطيع مطابقة أو اعتماد جلسة (تصعيد صلاحيات)', async () => {
    const sessions = await request(app.getHttpServer()).get('/collections/sessions')
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const anySession = sessions.body.data.items[0];
    await request(app.getHttpServer()).post(`/collections/sessions/${anySession.id}/approve`)
      .set('Authorization', `Bearer ${collectorToken}`).expect(403);
  });

  it('جلسة مُعتمدة لا تُسلَّم مجددًا (حالة غير صالحة)', async () => {
    const sessions = await request(app.getHttpServer()).get('/collections/sessions')
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const approved = sessions.body.data.items.find((s: { status: string }) => s.status === 'APPROVED');
    await request(app.getHttpServer()).post(`/collections/sessions/${approved.id}/submit`)
      .set('Authorization', `Bearer ${collectorToken}`)
      .send({ cashSubmitted: '0' }).expect(422);
  });
});
