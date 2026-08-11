/**
 * إنشاء حساب مدير (مالك منظمة) — آمن للتشغيل في الإنتاج، على عكس seed.ts
 * (الذي يرفض العمل في production ويحتوي بيانات تجريبية فقط، §175).
 *
 * هذا الملف لا يُنشئ أي بيانات وهمية — فقط:
 *   1) الصلاحيات + الأدوار النظامية (idempotent، ضرورية حتى يعمل
 *      /api/v1/auth/register أصلاً، لأنه يعتمد على وجود دور ORGANIZATION_OWNER).
 *   2) منظمة واحدة + مستخدم واحد بدور ORGANIZATION_OWNER، من متغيرات البيئة.
 *
 * الاستخدام (من جهازك، موجّهًا لقاعدة بيانات الإنتاج):
 *
 *   DATABASE_URL="<رابط قاعدة بيانات الإنتاج>" \
 *   ADMIN_ORG_NAME="اسم الشركة" \
 *   ADMIN_NAME="اسم المدير" \
 *   ADMIN_PHONE="07700000000" \
 *   ADMIN_PASSWORD="كلمة-مرور-قوية" \
 *   pnpm --filter @app/prisma seed:admin
 *
 * إذا كان الهاتف موجودًا مسبقًا، لا يُنشئ حسابًا مكررًا؛ فقط يتأكد من
 * تهيئة الأدوار ويطبع رسالة توضح أن الحساب موجود بالفعل.
 */
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { seedSystemData } from './lib/system-data';

const prisma = new PrismaClient();

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const OWNER_ROLE = 'ORGANIZATION_OWNER';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`متغير البيئة ${name} مطلوب ولم يتم تعيينه.`);
  }
  return value.trim();
}

async function main(): Promise<void> {
  // 1) تهيئة الصلاحيات + الأدوار (يجب أن تكون موجودة قبل أي تسجيل دخول/إنشاء مستخدم).
  await seedSystemData(prisma);
  console.log('تم التأكد من تهيئة الصلاحيات والأدوار.');

  const orgName = requireEnv('ADMIN_ORG_NAME');
  const name = requireEnv('ADMIN_NAME');
  const phone = requireEnv('ADMIN_PHONE');
  const password = requireEnv('ADMIN_PASSWORD');

  if (password.length < 10) {
    throw new Error('ADMIN_PASSWORD قصيرة جدًا — استخدم كلمة مرور قوية (10 أحرف على الأقل).');
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log(`المستخدم بالهاتف ${phone} موجود مسبقًا (id: ${existing.id}) — لم يتم إنشاء حساب جديد.`);
    return;
  }

  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: OWNER_ROLE } });
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: orgName, phone },
    });
    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        name,
        phone,
        passwordHash,
        status: 'ACTIVE',
      },
    });
    await tx.userRole.create({
      data: { userId: user.id, roleId: ownerRole.id, organizationId: organization.id },
    });
    return { organization, user };
  });

  console.log('تم إنشاء حساب المدير بنجاح:');
  console.log(`  المنظمة: ${result.organization.name} (${result.organization.id})`);
  console.log(`  المستخدم: ${result.user.name} — الهاتف: ${result.user.phone}`);
  console.log('سجّل الدخول من الواجهة بهذا الهاتف وكلمة المرور التي حددتها.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
