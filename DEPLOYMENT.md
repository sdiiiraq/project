# النشر على Vercel (GitHub → Vercel)

المشروع Monorepo بتطبيقين، يُنشران كـ **مشروعين منفصلين على Vercel** من نفس المستودع
(هذا هو الأسلوب القياسي لنشر Next.js + خلفية API معًا على Vercel):

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

## ملاحظات توافق تمّ تنفيذها في الكود

- `app.listen()` استُبدل بدالة لاخادومية (`apps/api/api/[...path].ts`) تبني تطبيق Nest/Express مرة واحدة وتُعيد استخدامه بين الاستدعاءات الدافئة.
- `@Cron` الداخلي (`@nestjs/schedule`) استُبدل بمسار HTTP محمي (`BillingCronController`) يستدعيه Vercel Cron Jobs.
- BullMQ/Redis queue غير المستخدمة فعليًا أُزيلت بالكامل (لم تكن تُشغّل أي processor).
- تخزين الملفات المحلي على القرص استُبدل بمحرك `vercel-blob` (القرص المحلي يبقى متاحًا فقط للتطوير المحلي).
- `binaryTargets` في `prisma/schema.prisma` أُضيف لدعم بيئة تشغيل Lambda الخاصة بـ Vercel.
