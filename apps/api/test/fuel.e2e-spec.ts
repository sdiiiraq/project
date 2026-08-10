import { ValidationPipe } from '@nestjs/common';
import { NestApplication } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/response.interceptor';

describe('Fuel (e2e)', () => {
  let app: NestApplication;
  let ownerToken: string;
  let generatorId: string;

  const randomPhone = () => `077${String(Math.floor(10000000 + Math.random() * 89999999))}`;
  const password = 'Test#Pass2026x';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    const reg = await request(app.getHttpServer()).post('/auth/register')
      .send({ organizationName: 'منظمة الوقود', name: 'مالك', phone: randomPhone(), password }).expect(201);
    ownerToken = reg.body.data.accessToken;

    const gen = await request(app.getHttpServer()).post('/generators').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'مولدة الوقود' }).expect(201);
    generatorId = gen.body.data.id;
  });

  afterAll(async () => { await app.close(); });

  it('شراء دون العتبة يعتمد تلقائيًا ويدخل المخزون', async () => {
    await request(app.getHttpServer()).post('/fuel/purchases').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, quantity: '100', unit: 'LITER', unitCost: '1000' }).expect(201);
    const inv = await request(app.getHttpServer()).get('/fuel/inventory').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const row = inv.body.data.items.find((i: { generatorId: string }) => i.generatorId === generatorId);
    expect(row.netLiters).toBe('100');
  });

  it('الاستهلاك يخصم المخزون', async () => {
    await request(app.getHttpServer()).post('/fuel/consumption').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, quantity: '40', unit: 'LITER' }).expect(201);
    const inv = await request(app.getHttpServer()).get('/fuel/inventory').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const row = inv.body.data.items.find((i: { generatorId: string }) => i.generatorId === generatorId);
    expect(row.netLiters).toBe('60');
  });

  it('شراء فوق العتبة يبقى معلقًا حتى الموافقة', async () => {
    const purchase = await request(app.getHttpServer()).post('/fuel/purchases').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, quantity: '1000', unit: 'LITER', unitCost: '1000' }).expect(201);
    expect(purchase.body.data.status).toBe('PENDING');

    await request(app.getHttpServer()).post(`/fuel/purchases/${purchase.body.data.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);

    const inv = await request(app.getHttpServer()).get('/fuel/inventory').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const row = inv.body.data.items.find((i: { generatorId: string }) => i.generatorId === generatorId);
    expect(row.netLiters).toBe('1060');
  });

  it('التحليلات تحسب لتر/ساعة وتكشف الشذوذ بعتبة حتمية', async () => {
    // اضبط الاستهلاك المتوقع على 10 لتر/ساعة
    await request(app.getHttpServer()).put('/fuel/config').set('Authorization', `Bearer ${ownerToken}`)
      .send({ expectedLitersPerHour: '10', varianceThresholdPercent: 25 }).expect(200);

    // أنشئ جلسة تشغيل لمدة ساعتين (120 دقيقة)
    const start = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const runtime = await request(app.getHttpServer()).post('/operations/runtime').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, startTime: start }).expect(201);
    await request(app.getHttpServer()).post(`/operations/runtime/${runtime.body.data.id}/stop`)
      .set('Authorization', `Bearer ${ownerToken}`).send({}).expect(200);

    const analytics = await request(app.getHttpServer()).get('/fuel/analytics').set('Authorization', `Bearer ${ownerToken}`)
      .query({ generatorId }).expect(200);
    const row = analytics.body.data.rows.find((r: { generatorId: string }) => r.generatorId === generatorId);
    expect(row).toBeDefined();
    expect(Number(row.runtimeHours)).toBeGreaterThan(0);
    expect(Number(row.consumedLiters)).toBeGreaterThan(0);
    expect(row.fuelPerRuntimeHour).toBeDefined();
    expect(typeof row.abnormal).toBe('boolean');
  });
});
