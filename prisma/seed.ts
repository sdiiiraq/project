/**
 * Development-only seed (§131, §175).
 * يرفض العمل في production. بيانات الأسعار تجريبية وليست أسعارًا حقيقية.
 * لا تُشحن كلمات المرور الافتراضية إلى أي بيئة إنتاج (§132).
 */
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { seedSystemData } from './lib/system-data';

const prisma = new PrismaClient();

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const DEMO_PASSWORD = 'Dev#Generator2026';
export const DEMO_ORG_ID = '11111111-2222-3333-4444-555555555555';

const EXPENSE_CATEGORIES = [
  { name: 'fuel', nameAr: 'وقود' },
  { name: 'salaries', nameAr: 'رواتب' },
  { name: 'maintenance', nameAr: 'صيانة' },
  { name: 'spare_parts', nameAr: 'قطع غيار' },
  { name: 'electricity', nameAr: 'كهرباء' },
  { name: 'rent', nameAr: 'إيجار' },
  { name: 'collection_cost', nameAr: 'تكلفة تحصيل' },
  { name: 'transportation', nameAr: 'نقل' },
  { name: 'administrative', nameAr: 'إدارية' },
  { name: 'other', nameAr: 'أخرى' },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed is development-only. Refusing to run in production (§175).');
  }

  // ---------- الصلاحيات + الأدوار ----------
  await seedSystemData(prisma);

  // ---------- منظمة تجريبية ----------
  const org = await prisma.organization.upsert({
    where: { id: DEMO_ORG_ID },
    update: {},
    create: {
      id: DEMO_ORG_ID,
      name: 'مولدات الرصافة (تجريبي)',
      phone: '07700000000',
      city: 'بغداد',
      governorate: 'بغداد',
    },
  });

  const passwordHash = await argon2.hash(DEMO_PASSWORD, ARGON2_OPTIONS);

  // ---------- مستخدمون لكل دور ----------
  const demoUsers = [
    { name: 'مالك المنظمة', phone: '07700000001', role: 'ORGANIZATION_OWNER' },
    { name: 'مدير المولدات', phone: '07700000002', role: 'GENERATOR_MANAGER' },
    { name: 'المحاسب', phone: '07700000003', role: 'ACCOUNTANT' },
    { name: 'الجابي أحمد', phone: '07700000004', role: 'COLLECTOR' },
    { name: 'الفني حسن', phone: '07700000005', role: 'TECHNICIAN' },
  ];

  const userIds: Record<string, string> = {};
  for (const u of demoUsers) {
    let user = await prisma.user.findUnique({ where: { phone: u.phone } });
    if (!user) {
      user = await prisma.user.create({
        data: { organizationId: org.id, name: u.name, phone: u.phone, passwordHash, status: 'ACTIVE' },
      });
      const role = await prisma.role.findUniqueOrThrow({ where: { name: u.role } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, organizationId: org.id } });
    }
    userIds[u.role] = user.id;
  }

  // ---------- مولدتان ----------
  const gen1 = await prisma.generator.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'KRD-01' } },
    update: {},
    create: {
      organizationId: org.id, name: 'مولدة الكرادة', code: 'KRD-01',
      city: 'بغداد', governorate: 'بغداد', fuelType: 'DIESEL',
      capacity: '500', operatingStatus: 'ON',
    },
  });
  const gen2 = await prisma.generator.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'MNS-01' } },
    update: {},
    create: {
      organizationId: org.id, name: 'مولدة المنصور', code: 'MNS-01',
      city: 'بغداد', governorate: 'بغداد', fuelType: 'DIESEL',
      capacity: '350', operatingStatus: 'ON',
    },
  });

  // ---------- نطاق وصول المستخدمين للمولدات ----------
  for (const role of ['GENERATOR_MANAGER', 'COLLECTOR', 'TECHNICIAN']) {
    const userId = userIds[role];
    for (const gen of [gen1, gen2]) {
      await prisma.generatorUserScope.upsert({
        where: { userId_generatorId: { userId, generatorId: gen.id } },
        update: {},
        create: { userId, generatorId: gen.id },
      });
    }
  }

  // ---------- ملف جابٍ ----------
  await prisma.collector.upsert({
    where: { userId: userIds['COLLECTOR'] },
    update: {},
    create: {
      organizationId: org.id, userId: userIds['COLLECTOR'],
      name: 'الجابي أحمد', phone: '07700000004', employeeCode: 'COL-001',
    },
  });

  // ---------- تصنيفات المصاريف ----------
  for (const c of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { organizationId_name: { organizationId: org.id, name: c.name } },
      update: {},
      create: { organizationId: org.id, name: c.name, nameAr: c.nameAr, isSystem: true },
    });
  }

  // ---------- خطط الأمبير (أسعار تجريبية) ----------
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const plan5 = await prisma.amperePlan.upsert({
    where: { id: 'aaaaaaaa-0000-0000-0000-000000000005' },
    update: {},
    create: {
      id: 'aaaaaaaa-0000-0000-0000-000000000005',
      organizationId: org.id, generatorId: gen1.id,
      name: '5 أمبير', ampereAmount: '5', price: '75000',
      billingCycle: 'MONTHLY', effectiveFrom: start, status: 'ACTIVE',
    },
  });
  const plan10 = await prisma.amperePlan.upsert({
    where: { id: 'aaaaaaaa-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: 'aaaaaaaa-0000-0000-0000-000000000010',
      organizationId: org.id, generatorId: gen1.id,
      name: '10 أمبير', ampereAmount: '10', price: '150000',
      billingCycle: 'MONTHLY', effectiveFrom: start, status: 'ACTIVE',
    },
  });

  // ---------- مشتركون + اشتراكات ----------
  const customersData = [
    { customerNumber: '1001', fullName: 'محمد جاسم', phone: '07801000001', neighborhood: 'الكرادة داخل', plan: plan5 },
    { customerNumber: '1002', fullName: 'علي حسين', phone: '07801000002', neighborhood: 'الكرادة داخل', plan: plan10 },
    { customerNumber: '1003', fullName: 'فاطمة كريم', phone: '07801000003', neighborhood: 'الجادرية', plan: plan5 },
  ];
  for (const c of customersData) {
    const existing = await prisma.customer.findUnique({
      where: { generatorId_customerNumber: { generatorId: gen1.id, customerNumber: c.customerNumber } },
    });
    if (!existing) {
      const customer = await prisma.customer.create({
        data: {
          organizationId: org.id, generatorId: gen1.id,
          customerNumber: c.customerNumber, fullName: c.fullName,
          phonePrimary: c.phone, neighborhood: c.neighborhood, status: 'ACTIVE',
        },
      });
      await prisma.subscription.create({
        data: {
          organizationId: org.id, customerId: customer.id, generatorId: gen1.id,
          amperePlanId: c.plan.id, startDate: start, status: 'ACTIVE', billingCycle: 'MONTHLY',
        },
      });
    }
  }

  // ---------- تعيينات الجابي ----------
  const collectorProfile = await prisma.collector.findFirst({ where: { organizationId: org.id } });
  if (collectorProfile) {
    const demoCustomers = await prisma.customer.findMany({ where: { generatorId: gen1.id } });
    for (const c of demoCustomers) {
      const exists = await prisma.collectorAssignment.findFirst({
        where: { collectorId: collectorProfile.id, customerId: c.id, status: 'ACTIVE' },
      });
      if (!exists) {
        await prisma.collectorAssignment.create({
          data: {
            organizationId: org.id,
            collectorId: collectorProfile.id,
            generatorId: gen1.id,
            customerId: c.id,
          },
        });
      }
    }
  }

  // ---------- موظفون ----------
  const techUser = await prisma.user.findUnique({ where: { phone: '07700000005' } });
  const employeeTech = await prisma.employee.upsert({
    where: { organizationId_employeeCode: { organizationId: org.id, employeeCode: 'EMP-001' } },
    update: {},
    create: {
      organizationId: org.id, generatorId: gen1.id, userId: techUser?.id ?? null,
      name: 'الفني حسن', role: 'TECHNICIAN', employeeCode: 'EMP-001',
      salary: '600000', hireDate: new Date('2025-01-15'),
    },
  });
  await prisma.employee.upsert({
    where: { organizationId_employeeCode: { organizationId: org.id, employeeCode: 'EMP-002' } },
    update: {},
    create: {
      organizationId: org.id, generatorId: gen1.id,
      name: 'المشغل سعدي', role: 'OPERATOR', employeeCode: 'EMP-002', salary: '500000',
    },
  });

  // ---------- قطع غيار ----------
  const filterOil = await prisma.sparePart.upsert({
    where: { id: 'cccccccc-0000-0000-0000-000000000001' },
    update: {},
    create: { id: 'cccccccc-0000-0000-0000-000000000001', organizationId: org.id, name: 'فلتر زيت', quantity: 10, unitCost: '15000' },
  });
  await prisma.sparePart.upsert({
    where: { id: 'cccccccc-0000-0000-0000-000000000002' },
    update: {},
    create: { id: 'cccccccc-0000-0000-0000-000000000002', organizationId: org.id, name: 'فلتر هواء', quantity: 8, unitCost: '20000' },
  });

  // ---------- وقود ----------
  const fuelSupplier = await prisma.fuelSupplier.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'شركة الرافدين للوقود' } },
    update: {},
    create: { organizationId: org.id, name: 'شركة الرافدين للوقود', phone: '07901112222' },
  });
  const fuelPurchaseCount = await prisma.fuelPurchase.count({ where: { generatorId: gen1.id } });
  if (fuelPurchaseCount === 0 && techUser) {
    const purchase = await prisma.fuelPurchase.create({
      data: {
        organizationId: org.id, generatorId: gen1.id, supplierId: fuelSupplier.id,
        quantity: '2000', unit: 'LITER', unitCost: '700', totalCost: '1400000',
        purchaseDate: new Date(Date.now() - 5 * 86_400_000), invoiceNumber: 'INV-1001',
        status: 'APPROVED', createdBy: techUser.id, approvedBy: techUser.id, approvedAt: new Date(),
      },
    });
    await prisma.fuelInventoryTransaction.create({
      data: {
        organizationId: org.id, generatorId: gen1.id, type: 'PURCHASE_IN',
        quantity: '2000', unit: 'LITER', referenceId: purchase.id,
        notes: 'فاتورة: INV-1001', createdBy: techUser.id,
      },
    });
    const consumption = await prisma.fuelConsumptionRecord.create({
      data: {
        organizationId: org.id, generatorId: gen1.id, quantity: '180', unit: 'LITER',
        source: 'MANUAL', notes: 'قراءة أسبوعية', createdBy: techUser.id,
      },
    });
    await prisma.fuelInventoryTransaction.create({
      data: {
        organizationId: org.id, generatorId: gen1.id, type: 'CONSUMPTION_OUT',
        quantity: '180', unit: 'LITER', referenceId: consumption.id, createdBy: techUser.id,
      },
    });
  }

  // ---------- تشغيل وانقطاع ----------
  const runtimeCount = await prisma.generatorRuntime.count({ where: { generatorId: gen1.id } });
  if (runtimeCount === 0 && techUser) {
    const dayAgo = Date.now() - 24 * 3_600_000;
    await prisma.generatorRuntime.create({
      data: {
        organizationId: org.id, generatorId: gen1.id,
        startTime: new Date(dayAgo + 6 * 3_600_000),
        endTime: new Date(dayAgo + 18 * 3_600_000),
        durationMinutes: 720, source: 'MANUAL', notes: 'تشغيل يومي', createdBy: techUser.id,
      },
    });
    await prisma.generatorOutage.create({
      data: {
        organizationId: org.id, generatorId: gen1.id,
        startedAt: new Date(Date.now() - 2 * 3_600_000),
        endedAt: new Date(),
        durationMinutes: 120, type: 'UNPLANNED', reason: 'انقطاع طارئ',
        description: 'انقطاع بسبب الشبكة الوطنية', createdBy: techUser.id,
      },
    });
  }

  // ---------- صيانة ----------
  const maintCount = await prisma.maintenanceRecord.count({ where: { generatorId: gen1.id } });
  if (maintCount === 0 && techUser) {
    const maint = await prisma.maintenanceRecord.create({
      data: {
        organizationId: org.id, generatorId: gen1.id, type: 'صيانة دورية',
        date: new Date(), description: 'تغيير زيت وفلاتر',
        technicianId: employeeTech.id, cost: '50000',
        nextMaintenanceDate: new Date(Date.now() + 30 * 86_400_000),
        runtimeAtMaintenance: 1200, status: 'PLANNED', createdBy: techUser.id,
      },
    });
    await prisma.maintenanceSparePart.create({
      data: {
        organizationId: org.id, maintenanceId: maint.id, sparePartId: filterOil.id,
        quantity: 1, unitCost: '15000',
      },
    });
  }

  console.log('Seed completed (development only).');
  console.log(`Login example => phone: 07700000001 / password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
