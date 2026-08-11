import type { PrismaClient } from '@prisma/client';

/**
 * بيانات مرجعية ثابتة (الصلاحيات + الأدوار) — ليست بيانات تجريبية.
 * آمنة للتشغيل في أي بيئة، بما فيها الإنتاج، لأنها idempotent (upsert)
 * ولا تحتوي أي بيانات شخصية أو حسابات افتراضية.
 *
 * تُستخدم من:
 *  - seed.ts (التطوير: بيانات تجريبية كاملة)
 *  - seed-admin.ts (الإنتاج: تهيئة الأدوار + إنشاء حساب مدير واحد فقط)
 */

export const PERMISSION_KEYS = [
  'organization.read', 'organization.update',
  'generator.create', 'generator.read', 'generator.update', 'generator.delete',
  'customer.create', 'customer.read', 'customer.update', 'customer.archive',
  'subscription.create', 'subscription.read', 'subscription.update', 'subscription.cancel',
  'bill.create', 'bill.read', 'bill.update', 'bill.adjust', 'bill.void',
  'payment.create', 'payment.read', 'payment.reverse',
  'collection.read', 'collection.create', 'collection.reconcile', 'collection.approve',
  'expense.create', 'expense.read', 'expense.update', 'expense.approve',
  'fuel.create', 'fuel.read', 'fuel.update', 'fuel.approve',
  'maintenance.create', 'maintenance.read', 'maintenance.update',
  'employee.create', 'employee.read', 'employee.update',
  'operations.create', 'operations.read', 'operations.update',
  'reports.read', 'financial_reports.read',
  'file.upload', 'file.read', 'export.create', 'export.read',
  'user.create', 'user.read', 'user.update', 'user.disable',
  'role.manage', 'audit.read', 'settings.read', 'settings.update',
];

const ALL_ORG = [...PERMISSION_KEYS];

export const ROLE_DEFS: { name: string; description: string; permissions: string[] }[] = [
  { name: 'SUPER_ADMIN', description: 'مدير المنصة', permissions: ALL_ORG },
  { name: 'ORGANIZATION_OWNER', description: 'مالك المنظمة', permissions: ALL_ORG },
  {
    name: 'GENERATOR_OWNER', description: 'مالك مولدة',
    permissions: [
      'generator.read', 'generator.update',
      'customer.create', 'customer.read', 'customer.update', 'customer.archive',
      'subscription.create', 'subscription.read', 'subscription.update', 'subscription.cancel',
      'bill.create', 'bill.read', 'bill.update', 'bill.adjust', 'bill.void',
      'payment.create', 'payment.read', 'payment.reverse',
      'collection.read', 'collection.create', 'collection.reconcile', 'collection.approve',
      'expense.create', 'expense.read', 'expense.update', 'expense.approve',
      'fuel.create', 'fuel.read', 'fuel.update', 'fuel.approve',
      'maintenance.create', 'maintenance.read', 'maintenance.update',
      'employee.create', 'employee.read', 'employee.update',
      'operations.create', 'operations.read', 'operations.update',
      'reports.read', 'financial_reports.read', 'audit.read',
      'file.upload', 'file.read', 'export.create', 'export.read',
    ],
  },
  {
    name: 'GENERATOR_MANAGER', description: 'مدير مولدة',
    permissions: [
      'generator.read',
      'customer.create', 'customer.read', 'customer.update', 'customer.archive',
      'subscription.create', 'subscription.read', 'subscription.update', 'subscription.cancel',
      'bill.create', 'bill.read', 'bill.update',
      'payment.create', 'payment.read',
      'collection.read', 'collection.create', 'collection.reconcile',
      'expense.create', 'expense.read',
      'fuel.create', 'fuel.read',
      'maintenance.create', 'maintenance.read', 'maintenance.update',
      'operations.create', 'operations.read', 'operations.update',
      'employee.read', 'reports.read',
      'file.upload', 'file.read', 'export.create', 'export.read',
    ],
  },
  {
    name: 'ACCOUNTANT', description: 'محاسب',
    permissions: [
      'organization.read', 'generator.read', 'customer.read', 'subscription.read',
      'bill.read', 'bill.adjust',
      'payment.read', 'payment.reverse',
      'collection.read', 'collection.reconcile',
      'expense.create', 'expense.read', 'expense.update', 'expense.approve',
      'fuel.read', 'reports.read', 'financial_reports.read', 'audit.read',
      'file.upload', 'file.read', 'export.create', 'export.read',
    ],
  },
  {
    name: 'COLLECTOR', description: 'جابٍ',
    permissions: ['customer.read', 'bill.read', 'payment.create', 'payment.read', 'collection.read', 'collection.create'],
  },
  {
    name: 'TECHNICIAN', description: 'فني',
    permissions: ['generator.read', 'operations.create', 'operations.read', 'operations.update', 'maintenance.create', 'maintenance.read', 'maintenance.update', 'fuel.read'],
  },
  { name: 'CUSTOMER', description: 'مشترك (بوابة المشتركين مستقبلًا)', permissions: [] },
];

/** يهيّئ جدولي الصلاحيات والأدوار فقط (upsert بالكامل — آمن للتكرار وللإنتاج). */
export async function seedSystemData(prisma: PrismaClient): Promise<void> {
  for (const key of PERMISSION_KEYS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  for (const def of ROLE_DEFS) {
    const role = await prisma.role.upsert({
      where: { name: def.name },
      update: { description: def.description },
      create: { name: def.name, description: def.description, systemRole: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const key of def.permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
  }
}
