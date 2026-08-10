import { ValidationPipe } from '@nestjs/common';
import { NestApplication } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/response.interceptor';

describe('Operations + Maintenance + Employees (e2e)', () => {
  let app: NestApplication;
  let ownerToken: string;
  let managerToken: string;
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
      .send({ organizationName: 'منظمة التشغيل', name: 'مالك', phone: randomPhone(), password }).expect(201);
    ownerToken = reg.body.data.accessToken;

    const gen = await request(app.getHttpServer()).post('/generators').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'مولدة التشغيل' }).expect(201);
    generatorId = gen.body.data.id;

    const mgrPhone = randomPhone();
    await request(app.getHttpServer()).post('/users').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'مدير', phone: mgrPhone, password, roleName: 'GENERATOR_MANAGER' }).expect(201);
    const mgrLogin = await request(app.getHttpServer()).post('/auth/login').send({ phone: mgrPhone, password }).expect(201);
    managerToken = mgrLogin.body.data.accessToken;
  });

  afterAll(async () => { await app.close(); });

  it('جلسة تشغيل واحدة مفتوحة لكل مولدة، والإيقاف يحسب المدة', async () => {
    await request(app.getHttpServer()).post('/operations/runtime').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, source: 'MANUAL' }).expect(201);
    await request(app.getHttpServer()).post('/operations/runtime').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId }).expect(422);

    const list = await request(app.getHttpServer()).get('/operations/runtime')
      .set('Authorization', `Bearer ${ownerToken}`).query({ generatorId }).expect(200);
    const runtimeId = list.body.data.items[0].id;
    const stopped = await request(app.getHttpServer()).post(`/operations/runtime/${runtimeId}/stop`)
      .set('Authorization', `Bearer ${ownerToken}`).send({}).expect(200);
    expect(stopped.body.data.endTime).toBeDefined();
    expect(stopped.body.data.durationMinutes).toBeGreaterThanOrEqual(0);
  });

  it('انقطاع غير مخطط يحول الحالة إلى FAULT، وإنهاؤه يعيدها ON', async () => {
    const outage = await request(app.getHttpServer()).post('/operations/outages').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, type: 'UNPLANNED', reason: 'عطل مفاجئ' }).expect(201);

    let gen = await request(app.getHttpServer()).get(`/generators/${generatorId}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(gen.body.data.operatingStatus).toBe('FAULT');

    await request(app.getHttpServer()).post(`/operations/outages/${outage.body.data.id}/end`)
      .set('Authorization', `Bearer ${ownerToken}`).send({}).expect(200);

    gen = await request(app.getHttpServer()).get(`/generators/${generatorId}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(gen.body.data.operatingStatus).toBe('ON');
  });

  it('دورة صيانة كاملة مع قطع غيار وخصم مخزون', async () => {
    const part = await request(app.getHttpServer()).post('/maintenance/spare-parts').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'فلتر زيت', quantity: 5, unitCost: '15000' }).expect(201);
    const partId = part.body.data.id;

    const maint = await request(app.getHttpServer()).post('/maintenance').set('Authorization', `Bearer ${ownerToken}`)
      .send({ generatorId, type: 'تغيير زيت', description: 'صيانة دورية' }).expect(201);
    const maintId = maint.body.data.id;

    await request(app.getHttpServer()).post(`/maintenance/${maintId}/start`).set('Authorization', `Bearer ${ownerToken}`).send({}).expect(200);

    await request(app.getHttpServer()).post(`/maintenance/${maintId}/parts`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ sparePartId: partId, quantity: 2 }).expect(201);

    const parts = await request(app.getHttpServer()).get('/maintenance/spare-parts').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const updatedPart = parts.body.data.find((p: { id: string }) => p.id === partId);
    expect(updatedPart.quantity).toBe(3);

    const completed = await request(app.getHttpServer()).post(`/maintenance/${maintId}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`).send({ cost: '50000' }).expect(200);
    expect(completed.body.data.status).toBe('COMPLETED');
    expect(completed.body.data.nextMaintenanceDate).toBeDefined();
  });

  it('الراتب مخفي عن المدير غير المالي، ظاهر للمالك (§52)', async () => {
    await request(app.getHttpServer()).post('/employees').set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'موظف تجريبي', role: 'محاسب', employeeCode: 'EMP-100', salary: '600000' }).expect(201);

    const ownerList = await request(app.getHttpServer()).get('/employees').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(ownerList.body.data.items[0].salary).toBe('600000');

    const mgrList = await request(app.getHttpServer()).get('/employees').set('Authorization', `Bearer ${managerToken}`).expect(200);
    expect(mgrList.body.data.items[0].salary).toBeNull();
  });
});
