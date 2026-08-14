# أمبير — AMPERE

منصة SaaS لإدارة المولدات الأهلية في العراق — الاشتراكات، الجباية، الوقود، الصيانة، والتقارير في مكان واحد.

## المكدس التقني

- **Next.js 15** (App Router) + TypeScript
- **Supabase** — Auth (Google / Email / Iraqi Phone) + Postgres
- **Prisma** — ORM وطبقة الوصول لقاعدة البيانات
- **Tailwind CSS** + مكونات على طراز shadcn/ui
- **Zod** + **React Hook Form** للتحقق من المدخلات
- **Vercel** — الاستضافة + Cron Jobs

## الإعداد المحلي

### 1. المتطلبات

- Node.js 20+
- pnpm 9+
- مشروع Supabase (احصل عليه من [supabase.com](https://supabase.com))

### 2. تثبيت الحزم

```bash
pnpm install
```

### 3. متغيرات البيئة

انسخ `.env.example` إلى `.env.local` واملأ القيم من إعدادات مشروع Supabase:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — من Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — من نفس الصفحة (لا تُشارك هذه القيمة أو تضعها في كود العميل)
- `DATABASE_URL` — من Project Settings → Database → Connection Pooling (منفذ 6543)
- `DIRECT_URL` — من نفس الصفحة، Direct Connection (منفذ 5432) — تُستخدم فقط لتشغيل الـ migrations

في لوحة Supabase (Authentication → Providers):

- فعّل **Email** وأطفئ "Confirm email" (لا نستخدم تأكيد البريد في الإصدار الحالي)
- فعّل **Phone** وأطفئ تأكيد OTP الإلزامي إن رغبت باعتماد كلمة مرور فقط
- فعّل **Google** وأضف Client ID / Secret، واضبط Redirect URL على:
  `https://<project-ref>.supabase.co/auth/v1/callback`
- أضف `${NEXT_PUBLIC_APP_URL}/auth/callback` ضمن Redirect URLs المسموحة

### 4. قاعدة البيانات

```bash
pnpm db:migrate        # ينشئ الجداول محليًا (تطوير)
pnpm db:seed           # يزرع الصلاحيات الافتراضية وتصنيفات المصاريف
pnpm db:seed:platform  # يزرع باقات المنصة (Starter/Business/Pro) والميزات
```

### منح صلاحية Platform Admin

لا يوجد تسجيل ذاتي لحساب Super Admin. بعد إنشاء حسابك العادي وتسجيل الدخول مرة واحدة، امنح نفسك الصلاحية يدويًا:

```sql
insert into platform_admins (id, "userId", role)
values (gen_random_uuid(), '<supabase-user-id>', 'SUPER_ADMIN');
```

ثم افتح `/admin`.

للنشر على بيئة الإنتاج:

```bash
pnpm db:deploy
```

### 5. التشغيل

```bash
pnpm dev
```

افتح [http://localhost:3000](http://localhost:3000)

## هيكل المشروع

```
app/                 مسارات Next.js App Router
  (auth)/            تسجيل الدخول، إنشاء الحساب، استعادة كلمة المرور
  (onboarding)/       معالج الإعداد الأولي بعد التسجيل
  (dashboard)/         لوحة تحكم صاحب المولدة (Multi-tenant, RBAC)
  auth/callback/      مسار تبادل جلسة Supabase (OAuth + Password Recovery)
components/
  ui/                مكونات واجهة أساسية
  layout/            القالب العام (Sidebar, Header, Mobile Nav)
  brand/             الهوية البصرية
lib/
  actions/           Server Actions
  auth/              جلسة المستخدم وربط Workspace
  db.ts              عميل Prisma
  rbac/              الصلاحيات والأدوار
  supabase/          عملاء Supabase (Browser / Server / Middleware)
  validation/        مخططات Zod
prisma/
  schema.prisma      نموذج قاعدة البيانات الكامل
  seed.ts            بيانات أولية (صلاحيات، تصنيفات مصاريف)
```

## حالة المشروع

يُبنى المشروع على مراحل. المرحلة الحالية المكتملة:

- [x] **المرحلة 1** — البنية، قاعدة البيانات، المصادقة، تعدد المستأجرين، RBAC، نظام التصميم، القالب المتجاوب
- [x] **المرحلة 2** — المشتركين، الاشتراكات، الجباية، السجل المالي، لوحة التحكم
- [x] **المرحلة 3** — الجباة، المصاريف، الوقود، الصيانة
- [x] **المرحلة 4** — التقارير، التحليلات، الإشعارات، PWA
- [x] **المرحلة 5** — لوحة تحكم المنصة (Super Admin)، الباقات، الفوترة، التجربة المجانية
- [x] **المرحلة 6** — الدعم الفني، الانتحال الآمن (Impersonation)
- [x] **المرحلة 7** — المساعد الذكي (Claude API)، التحليلات المتقدمة
- [x] **المرحلة 8** — مراجعة أمنية، تحسين أداء، تحصين نهائي

كل مرحلة اجتازت `typecheck` + `lint` + `test` + `build` بدون أخطاء، ومراجعة أمنية مخصصة لم تجد ثغرات عالية الثقة.
