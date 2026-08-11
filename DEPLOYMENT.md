# النشر على Vercel (GitHub → Vercel)

المشروع Monorepo بتطبيقين، يُنشران كـ **مشروعين منفصلين على Vercel** من نفس المستودع
(هذا هو الأسلوب القياسي لنشر Next.js + خلفية API معًا على Vercel):

## ⚠️ خطأ شائع: "No Output Directory named 'public' found"

هذا الخطأ يعني أن مشروع Vercel يبني من **جذر المستودع** (Root Directory الافتراضي)
بدل `apps/web`. لا يوجد أي `vercel.json` في جذر المستودع عن قصد — كل تطبيق له
`vercel.json` خاص به (`apps/web` يعتمد على الكشف التلقائي لـ Next.js، و`apps/api`
لديه `apps/api/vercel.json`). إذا أضفت `vercel.json` في الجذر أو تركت Root Directory
فارغًا، فسيحاول Vercel بناء كل التطبيقات معًا من الجذر ولن يجد مخرجات Next.js
(الموجودة في `apps/web/.next`)، فيسقط افتراضيًا على توقّع مجلد `public` ثابت.

**الحل:** في إعدادات كل مشروع على Vercel (Project Settings → General → Root Directory)،
حدد المسار الصحيح كما في الجدول أدناه، ولا تُنشئ `vercel.json` في جذر المستودع.

| التطبيق | Root Directory | Framework Preset |
|---|---|---|
| `apps/web` (Next.js) | `apps/web` | Next.js (كشف تلقائي) |
| `apps/api` (NestJS → دالة لاخادومية) | `apps/api` | Other |

## 1) مشروع الـ API (`apps/api`)

1. Vercel → Add New Project → اختر المستودع → **Root Directory = `apps/api`**.
2. Framework Preset: **Other**. الإعدادات (install/build/functions/crons) موجودة مسبقًا في `apps/api/vercel.json`.
3. متغيرات البيئة (Project Settings → Environment Variables) — انسخ القيم من `apps/api/.env.example`:
   - `DATABASE_URL` — رابط **pooled connection** (Supabase/Neon "Connection pooling" أو PgBouncer). لا تستخدم رابطًا مباشرًا (direct) في الإنتاج — كل استدعاء لاخادومي قد يفتح اتصالاً جديدًا.
   - `REDIS_URL` — Upstash Redis (يعمل عبر TCP من بيئة Vercel اللاخادومية).
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — `openssl rand -hex 32`.
   - `WEB_URL`, `CORS_ORIGINS` — نطاق مشروع `apps/web` على Vercel (مثال: `https://your-web.vercel.app`).
   - `STORAGE_DRIVER=vercel-blob` + `BLOB_READ_WRITE_TOKEN` — أنشئ Blob Store من تبويب Storage في Vercel واربطه بالمشروع؛ التوكن يُضاف تلقائيًا كمتغيّر بيئة.
   - `CRON_SECRET` — قيمة عشوائية؛ Vercel يرسلها تلقائيًا كترويسة `Authorization: Bearer <CRON_SECRET>` عند استدعاء الـ cron المعرّف في `vercel.json` (`/api/v1/internal/cron/billing-overdue-sweep`، يوميًا 08:00 بتوقيت بغداد).
   - `NODE_ENV=production`.
4. Deploy. نقطة الدخول الفعلية هي `apps/api/api/[...path].ts` (تلتقط كل مسارات `/api/*` تلقائيًا حسب اتفاقية Vercel لملفات الدوال الديناميكية — لا حاجة لأي rewrites إضافية).

## 2) مشروع الويب (`apps/web`)

1. Vercel → Add New Project → نفس المستودع → **Root Directory = `apps/web`**.
2. Framework Preset: Next.js (يُكتشف تلقائيًا).
3. متغيرات البيئة:
   - `NEXT_PUBLIC_API_URL` = رابط مشروع `apps/api` من الخطوة السابقة (مثال: `https://your-api.vercel.app`).
4. Deploy. طلبات المتصفح إلى `/api/*` تُوجَّه عبر `rewrites()` في `next.config.mjs` إلى `NEXT_PUBLIC_API_URL`.

## 3) قاعدة البيانات

- شغّل الترحيلات مرة واحدة من جهازك أو من CI (وليس من دالة Vercel نفسها):
  `DATABASE_URL=<production-url> pnpm --filter @app/prisma migrate:deploy`
- تأكد من أن رابط الإنتاج المستخدم في هذا الأمر هو الرابط **المباشر** (غير المجمّع/pooled) إن كان مزوّدك يفرّق بينهما لأغراض الترحيلات (شائع مع Neon/Supabase عبر متغيّر منفصل مثل `DIRECT_URL`).

## 4) أول حساب مدير (بعد الترحيلات مباشرة)

`prisma/seed.ts` يرفض العمل في production عمدًا (بيانات تجريبية فقط، §175)، لذا قاعدة
بيانات الإنتاج تبدأ **فارغة تمامًا** — حتى من الأدوار (`Role`/`Permission`). هذا يعني أن
`POST /api/v1/auth/register` سيفشل أيضًا لو استُخدم قبل تهيئة الأدوار، لأنه يتحقق من وجود
دور `ORGANIZATION_OWNER` مسبقًا.

استخدم `prisma/seed-admin.ts` بدل ذلك — سكربت آمن للإنتاج، لا يحتوي أي بيانات تجريبية أو
كلمات مرور افتراضية، ويقوم بأمرين فقط: تهيئة الأدوار/الصلاحيات، وإنشاء حساب مدير واحد
(مالك منظمة) من متغيرات البيئة:

```bash
DATABASE_URL="<رابط قاعدة بيانات الإنتاج>" \
ADMIN_ORG_NAME="اسم الشركة" \
ADMIN_NAME="اسم المدير" \
ADMIN_PHONE="07700000000" \
ADMIN_PASSWORD="كلمة-مرور-قوية-هنا" \
pnpm --filter @app/prisma seed:admin
```

- شغّله مرة واحدة فقط، من جهازك أو من CI — وليس من دالة Vercel.
- إذا كان `ADMIN_PHONE` مستخدَمًا مسبقًا، لن يُنشئ حسابًا مكررًا.
- بعد ذلك، سجّل الدخول من الواجهة (`/login`) بنفس الهاتف وكلمة المرور.
- `ADMIN_ORG_NAME` / `ADMIN_NAME` / `ADMIN_PHONE` / `ADMIN_PASSWORD` كلها مطلوبة —
  السكربت يتوقف بخطأ واضح إن نقص أحدها، لتفادي إنشاء حساب بقيم غير مقصودة.

## ملاحظات توافق تمّ تنفيذها في الكود

- `app.listen()` استُبدل بدالة لاخادومية (`apps/api/api/[...path].ts`) تبني تطبيق Nest/Express مرة واحدة وتُعيد استخدامه بين الاستدعاءات الدافئة.
- `@Cron` الداخلي (`@nestjs/schedule`) استُبدل بمسار HTTP محمي (`BillingCronController`) يستدعيه Vercel Cron Jobs.
- BullMQ/Redis queue غير المستخدمة فعليًا أُزيلت بالكامل (لم تكن تُشغّل أي processor).
- تخزين الملفات المحلي على القرص استُبدل بمحرك `vercel-blob` (القرص المحلي يبقى متاحًا فقط للتطوير المحلي).
- `binaryTargets` في `prisma/schema.prisma` أُضيف لدعم بيئة تشغيل Lambda الخاصة بـ Vercel.
