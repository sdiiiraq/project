# Scalability Final Audit — Ampere

> **تاريخ التدقيق:** 2026-08-19
> **المرجع:** `Scalability_Audit_Ampere.md`
> **قاعدة أساسية في هذا التقرير:** كل رقم هنا مقيس فعليًا. ما لم يُقَس مكتوب صراحةً أنه غير مقيس.

---

## 0. الخلاصة التنفيذية

| | الحالة |
|---|---|
| نقاط الانهيار المعروفة في التدقيق الأصلي | **مُعالجة بالكامل** (10/10) |
| اختبارات الوحدة | ✅ 27/27 |
| اختبارات التكامل والتزامن (PostgreSQL حقيقية) | ✅ 36/36 |
| الـ migrations | ✅ 14/14 مُطبَّقة ومُتحقَّق منها |
| typecheck · lint · build | ✅ نظيفة |
| اختبار حمل على طبقة قاعدة البيانات | ✅ منفَّذ، مع تحديد نقطة الانهيار |
| اختبار حمل على Vercel | ❌ **غير منفَّذ** — يتطلب نشرًا على staging |

**الحكم:** نقاط الانهيار البنيوية أُزيلت وأُثبت ذلك باختبارات تزامن حقيقية. **Capacity على Vercel غير مثبتة بعد** — الأرقام أدناه لطبقة قاعدة البيانات فقط.

**لا يجوز حتى الآن قول "النظام يتحمل N مشترك" ولا "Production Ready".**

---

## 1. مشاكل التدقيق الأصلي وحالتها

| # | المشكلة | الحالة | الدليل |
|---|---|---|---|
| P0-1 | حلقة تسلسلية بلا batching للفوترة الشهرية | ✅ | طابور `BillingJob` + `createMany` + cursor. اختبارات C/D/استئناف |
| P0-2 | لا rate limit ولا حصة على AI | ✅ | جدول `Usage` مُفعَّل + زيادة ذرّية. اختبار C: 10 مسموحة بالضبط من 50 |
| P1-1 | استعلامات تقارير بلا pagination | ✅ | `getReportPage` + تصدير متدفق بـ cursor |
| P1-2 | تحميل كل IDs المشتركين للعدّادات | ✅ | `count` في قاعدة البيانات. **325ms ← 12ms** |
| P1-3 | سباق `nextSubscriberNumber` | ✅ | `UPDATE … RETURNING` ذرّي. اختبار A: 50 متزامنة، صفر P2002 |
| P1-4 | `requireWorkspace` استعلامات متتالية | ✅ | 3 متتالية ← 1 جولة، بلا إضعاف تحقق |
| P2-1 | بحث `contains` بلا فهرس نصي | ✅ | GIN + `pg_trgm`. بحث الهاتف **10.6ms ← 3.3ms** |
| P2-2 | لا caching | ⏸️ | **مؤجَّل بقرار** — انظر §12 |
| P2-3 | Dashboard ~23 استعلامًا مع `reduce` | ✅ | 14 استعلامًا تجميعيًا، صفر صفوف للتجميع |
| P3 | لا `maxDuration` على الـ cron | ✅ | 60s على الأربعة + ميزانية زمنية 45s |

---

## 2. مشاكل لم يذكرها التدقيق الأصلي (اكتشفتها أثناء العمل)

| المشكلة | الخطورة | الحالة |
|---|---|---|
| `connection_limit` متضارب: 1 في `.env.local` و5 في `.env` | 🔴 عالية | ✅ مركزيًا في `lib/db.ts` |
| `CRON_SECRET` غير مضبوط ⇒ القيمة المتوقعة `Bearer undefined` (يمكن لأي شخص تشغيل الفوترة) | 🔴 **ثغرة أمنية** | ✅ fail-closed + `timingSafeEqual` |
| `/api/auth/signup` عام بلا أي حد | 🔴 عالية | ✅ rate limit موزّع، المُعرِّف مُجزَّأ |
| استجابة 500 في `signup` تُعيد `error.message` للعميل | 🟠 تسريب | ✅ حُذفت من الاستجابة، بقيت في السجل |
| `analytics.ts` — 8 استعلامات غير محدودة (غائب عن التدقيق) | 🟠 | ✅ `groupBy`/تجميع في SQL |
| `subscriptions/page.tsx` — كل الاشتراكات بلا حد مع join مزدوج | 🟠 | ✅ مُصفَّح |
| `daily-notifications` — كل الفواتير غير المدفوعة في التاريخ كله | 🟠 | ✅ `groupBy` + `having` + نافذة زمنية |
| `support/page.tsx` بلا حد | 🟠 | ✅ مُصفَّح |
| طبقة النطاق تستقبل `workspaceId` ولا تستخدمه للتقييد | 🟠 defense-in-depth | ✅ `assertCustomerInWorkspace` + 3 اختبارات هجوم |
| `maxWait` للمعاملات = 2s مقابل `pool_timeout` = 20s | 🟠 | ✅ موحَّد — أزال 258 فشلًا عند 400 متزامن |
| `initdb` على Windows يختار WIN1252 ⇒ فشل migrations العربية | 🟡 بيئة | ✅ `--encoding=UTF8` مفروض |

### 🔴 عيبان في منطق الفوترة كشفتهما اختبارات الفشل

**1. الـ backoff وكشف الأقفال الميتة كانا مُعطَّلين بفارق المنطقة الزمنية**

أعمدة `DateTime` في Prisma من نوع `timestamp` بلا منطقة زمنية، وPrisma يكتب ويقرأ بتوقيت UTC.
لكن `now()` في PostgreSQL نوعها `timestamptz`، فمقارنتها بالعمود تُحوِّل العمود حسب منطقة
زمنية الجلسة. القياس المباشر على جلسة `Asia/Baghdad`:

```
runAfter المخزَّن (UTC)              = 17:41:06   (بعد ساعة من الآن)
"runAfter" <= now()                  → true   ❌ العمل يُسحب رغم تأجيله
"runAfter" <= now() AT TIME ZONE UTC → false  ✅
```

الأثر: عمل فاشل يُعاد فورًا بدل انتظار الـ backoff، فيستنفد `maxAttempts` خلال لحظات
ويُصنَّف FAILED قبل أن تُتاح له فرصة حقيقية. وكذلك `reclaimStalledJobs` كان يسترجع
أعمالًا قبل موعدها بثلاث ساعات. على Supabase (جلسة UTC) لا يظهر العيب — لكنه كامن
وينفجر على أي جلسة بمنطقة زمنية أخرى.
**الإصلاح:** `now() AT TIME ZONE 'UTC'` في كل مقارنة وكتابة خام.

**2. عمل واحد تالف كان يُسقط دورة الفوترة بأكملها**

`parseCycle(job.cycle)` كان يُستدعى **خارج** كتلة `try` في `processBillingJob`. أي عمل
بدورة تالفة كان:
- يتجاوز منطق إعادة المحاولة كليًا ويبقى عالقًا في PROCESSING إلى الأبد
- **ويُسقط حلقة `drainBillingJobs`** — فتتوقف فوترة كل المولدات الأخرى في تلك الدورة

وهو بالضبط السيناريو الذي طلبتَ منعه: "cron انتهى ولا نعرف ماذا تم".
**الإصلاح:** نقل `parseCycle` داخل `try` + حزام أمان حول كل عمل في حلقة الـ drain.

### عيب أدخلتُه أنا وكشفه القياس
عند نقل عدّادات صفحة المشتركين إلى قاعدة البيانات (P1-2)، أنتجت علاقة Prisma `invoices: { some: … }` استعلامًا فرعيًا **بلا `workspaceId`** — فمسح جدول الفواتير كاملًا عبر كل المولدات. `EXPLAIN ANALYZE` على 200 مولدة أظهر `Parallel Seq Scan` بزمن **325ms**. بإضافة `workspaceId` صراحةً: **11.98ms**.

---

## 3. الملفات التي تغيّرت

**جديدة:**
```
lib/domain/billing-jobs.ts          طابور الفوترة (سحب ذرّي، إعادة محاولة، استرجاع)
lib/domain/ai-usage.ts              حصة AI + rate limit ذرّيان
lib/domain/rate-limit.ts            rate limit عام (IP مُجزَّأ)
lib/domain/monthly-aggregates.ts    تجميع شهري في SQL (قائمة بيضاء)
lib/domain/table-stats.ts           عدّ تقريبي من pg_class
lib/domain/retention.ts             سياسة الاحتفاظ بالبيانات التشغيلية
lib/cron/auth.ts                    تحقق cron يفشل مغلقًا
lib/cron/run.ts                     غلاف مراقبة موحّد
lib/observability/logger.ts         تسجيل مُهيكل بتنقية الأسرار
app/api/cron/billing-worker/        مستهلك الطابور
app/api/reports/export/             تصدير CSV متدفق
app/global-error.tsx                حد خطأ جذري
scripts/with-test-db.mjs            PostgreSQL مؤقتة (بلا Docker)
scripts/explain-analyze.ts          قياس خطط التنفيذ
scripts/load-test.ts                اختبار حمل على الكود الحقيقي
scripts/test-db-setup.mjs           تهيئة قاعدة اختبار
test/integration/                   36 اختبار تكامل وتزامن
lib/db.test.ts                      9 اختبارات لضبط التجمّع
```

**مُعدَّلة جوهريًا:** `lib/db.ts` · `lib/domain/billing.ts` · `lib/domain/dashboard.ts` · `lib/domain/analytics.ts` · `lib/domain/reports.ts` · `lib/domain/ai-context.ts` · `lib/auth/session.ts` · `lib/ai/client.ts` · `lib/actions/ai.actions.ts` · الـ cron routes الأربعة · `app/(dashboard)/customers/page.tsx` · `prisma/schema.prisma`

---

## 4. الـ Migrations

كلها **إضافية فقط** — لا حذف ولا تغيير أعمدة قائمة.

| Migration | المحتوى |
|---|---|
| `20260818190000_scalability_billing_jobs_ai_limits` | `BillingJob`، `AiRateLimitBucket`، `PlatformPlan.aiRequestLimit` |
| `20260819120000_atomic_subscriber_sequence` | `Workspace.subscriberSequence` + **backfill من MAX(الرقم)** |
| `20260819130000_customer_search_trigram_indexes` | `pg_trgm` + GIN على `name` و`phone` |
| `20260819140000_generic_rate_limit_buckets` | `RateLimitBucket` |
| `20260819150000_pagination_sort_indexes` | 3 فهارس ترتيب |
| `20260819160000_cron_run_observability` | `CronRun` |

⚠️ **الـ backfill حرج**: بدونه يبدأ العدّاد من صفر لكل مولدة قائمة ويصطدم أول مشترك جديد بالقيد الفريد. استُخدم `MAX(الرقم)` لا `COUNT(*)` لأن `COUNT` يُعيد إصدار رقم مستخدم إن سبق حذف صف.

⚠️ **فهارس GIN**: `CREATE INDEX` يقفل الكتابة، وPrisma يمنع `CONCURRENTLY` داخل معاملة. على جدول ضخم: نفّذها يدويًا بـ `CONCURRENTLY` ثم `prisma migrate resolve --applied`.

---

## 5. الفهارس

**مُضافة (كل واحد يخدم استعلامًا حقيقيًا):**

| الفهرس | يخدم | الحجم @50k |
|---|---|---|
| `customers(name gin_trgm_ops)` | بحث substring بالاسم | 896 KB |
| `customers(phone gin_trgm_ops)` | بحث بالهاتف | 1256 KB |
| `customers(workspaceId, createdAt)` | ترتيب القائمة + النمو الشهري | 3352 KB |
| `notifications(workspaceId, createdAt)` | صفحة الإشعارات | — |
| `audit_logs(createdAt)` | ترتيب عالمي في لوحة المنصّة | — |
| `billing_jobs(status, runAfter)` | سحب الأعمال | — |
| `billing_jobs(workspaceId, cycle)` UNIQUE | منع فوترة مزدوجة | — |

**مرفوضة عمدًا:**
- `subscriberNumber` trigram — 4 محارف، انتقائية شبه معدومة، والقيد الفريد يخدم المطابقة والبادئة
- `houseNumber` trigram — قيم قصيرة متكررة
- `support_tickets(updatedAt)` — عدد التذاكر لكل مولدة صغير

---

## 6. الاختبارات

### وحدة — 27/27
`monthRange` · `fuel` · `access` (RBAC) · `phone` · **`buildDatabaseUrl`** (9 اختبارات جديدة لضبط التجمّع)

### تكامل وتزامن — 36/36 مقابل PostgreSQL حقيقية

| الاختبار | النتيجة المقيسة |
|---|---|
| **A** — 50 `createCustomer` متزامنة، نفس المولدة | 50 رقمًا فريدًا، **صفر P2002**، 0.95s |
| **A2** — 100 حجز عدّاد متزامن | 100 قيمة فريدة، العدّاد = 100 بالضبط |
| **B** — الحد 100، البدء من 90، 50 طلبًا متزامنًا | **10 مسموحة بالضبط، 40 مرفوضة، الاستخدام = 100** |
| **B2** — الرفض سببه QUOTA لا rate limit | كل الـ 40 مصنّفة QUOTA |
| **C** — دورة فوترة مرتين | صفر فواتير مكررة |
| **C2** — 3 دورات متزامنة | 30 فاتورة بالضبط لـ 30 مشتركًا |
| **D** — worker-ان يسحبان معًا | صفر تداخل |
| **D2** — 3 workers متوازية | كل الأعمال DONE، `attempts=1` |
| **E** — استئناف بعد انقطاع | العالق يعود PENDING ويكتمل |
| **F** — عزل المستأجرين | صفر تسرب بيانات أو حصص |
| **G** — دفعة لمشترك مولدة أخرى | **مرفوضة** — صفر دفعات، فواتير الضحية سليمة |
| **H** — تغيير أمبير مشترك مولدة أخرى | **مرفوض** — صفر سجل تدقيق زائف |
| **I** — فشل عمل: backoff وسبب مسجَّل | PENDING + `runAfter` مؤجَّل + الخطأ محفوظ |
| **J** — عمل مؤجَّل لا يُسحب قبل موعده | لا يُسحب (كشف عيب المنطقة الزمنية) |
| **K** — استنفاد `maxAttempts` | FAILED + `failedAt` + سبب دائم |
| **L** — عمل FAILED لا يُعاد تنفيذه | لا يُسحب ولا يسترجعه مُسترجع العالقة |
| **M** — فشل مولدة لا يمنع البقية | الباقي DONE بفواتير كاملة (كشف عيب إسقاط الدورة) |
| **N** — سياسة الاحتفاظ | الفاشلة وغير المقروءة وسجل التدقيق تبقى |

**التشغيل:** `pnpm test:integration:local` — يُقلع PostgreSQL مؤقتة، يطبّق الـ migrations، ينظّف.

---

## 7. Connection Pool

```
Vercel instance → PrismaClient (singleton، اتصال واحد لكل instance في نطاق الموديول)
                → Supavisor :6543 (transaction mode، pgbouncer=true)
                → PostgreSQL
migrations      → :5432 (session mode) عبر DIRECT_URL
```

| الإعداد | القيمة | المتغير |
|---|---|---|
| `connection_limit` | 5 | `DATABASE_CONNECTION_LIMIT` |
| `pool_timeout` | 20s | `DATABASE_POOL_TIMEOUT` |
| `transaction maxWait` | 10s | `DATABASE_TX_MAX_WAIT_MS` |
| `transaction timeout` | 20s | `DATABASE_TX_TIMEOUT_MS` |

**الصيغة الحاكمة:** `(أقصى instances متزامنة) × connection_limit ≤ أقصى client connections في خطة Supabase`

⚠️ **يجب أن تتحقق من سقف Supavisor في خطتك** — لا أستطيع رؤيته من الكود.

---

## 8. Redis / Queue

**لا يوجد.** القرار: PostgreSQL بدل Redis لكل احتياجات P0.

| الاحتياج | التنفيذ |
|---|---|
| تنسيق الأعمال | `BillingJob` + `FOR UPDATE SKIP LOCKED` |
| عدّادات الاستخدام | `INSERT … ON CONFLICT DO UPDATE … WHERE value < limit RETURNING` |
| rate limiting | نوافذ ثابتة بنفس النمط الذرّي |
| caching | ⏸️ مؤجَّل |

**المبرر:** كل هذه منخفضة التردد وحرجة للـ correctness، ويجب أن تفشل مغلقة. Redis كان سيضيف SPOF ثانيًا بلا مكسب. يستحق النقاش عند تفعيل الـ caching.

---

## 9. معمارية Cron والأعمال

```
0 3 1 * *   monthly-invoices  → مُنتِج: job لكل مولدة + تصريف ضمن 45s
*/5 * * * * billing-worker     → مستهلك: يكمل الباقي
0 4 * * *   trial-expiration   → updateMany + createMany على دفعات
0 5 * * *   daily-notifications→ groupBy على مستوى المنصّة + createMany
```

**السحب الذرّي:**
```sql
UPDATE billing_jobs SET status='PROCESSING', "lockedBy"=$worker, attempts=attempts+1
WHERE id IN (SELECT id FROM billing_jobs
             WHERE status='PENDING' AND "runAfter" <= now()
             ORDER BY "createdAt" LIMIT $n FOR UPDATE SKIP LOCKED)
RETURNING …
```

**التعافي:** `reclaimStalledJobs()` يُعيد ما بقي PROCESSING > 15 دقيقة (موت الدالة) · backoff أسّي مع jitter · `maxAttempts=5` · سبب الفشل مسجَّل · `@@unique([workspaceId, cycle])` يمنع الازدواج.

**المراقبة:** كل تشغيل يُسجَّل في `CronRun` — RUNNING/SUCCESS/FAILED، المدة، processed/failed/pending، سبب الخطأ.

⚠️ `*/5` يتطلب **خطة Vercel Pro** (Hobby: cron يومي واحد).

---

## 10. حماية AI

- حصة شهرية من `PlatformPlan.aiRequestLimit`، زيادة ذرّية على `Usage`
- rate limit 10/دقيقة لكل مولدة (`AI_RATE_LIMIT_PER_MINUTE`)
- **الطلب المرفوض لا يصل إلى Anthropic إطلاقًا** — البوابة قبل أي كتابة أو استدعاء
- مهلة صريحة 20s + `maxRetries: 1` (أسوأ حالة ~40s)
- إرجاع الحجز عند الفشل حتى لا يُحتسب استدعاء لم ينجح
- رسائل عربية واضحة، وتصنيف QUOTA مقابل RATE_LIMIT

**عن مضاعفة التكلفة بالـ retry:** `maxRetries=1` يعني محاولتين كحد أقصى؛ الـ SDK لا يعيد المحاولة على 4xx الدائمة. الحجز يحدث **مرة واحدة قبل** الاستدعاء، فإعادة المحاولة الداخلية لا تستهلك حصة إضافية.

---

## 11. منهجية اختبار الحمل ونتائجه

**المنهجية:** استدعاء دوال النطاق الحقيقية (`getDashboardStats`، `createCustomerWithSubscription`، `applyPayment`، `reserveAiRequest`) بتزامن ثابت، على PostgreSQL حقيقية مبذورة بـ 50 مولدة × 200 مشترك + فواتير 3 أشهر.

**⚠️ نطاق القياس:** قاعدة بيانات محلية، زمن شبكة ≈ صفر. **لا يشمل Vercel** (بدء بارد، مدة الدالة، تزامن instances) ولا Supavisor. **هذه أرقام حدّ أعلى متفائلة.**

### النتائج (P95 بالمللي ثانية، صفر أخطاء)

| التزامن | لوحة التحكم | بحث المشتركين | تقرير | إضافة مشترك | حصة AI |
|---|---|---|---|---|---|
| 10 | 184 | 49 | 24 | 150 | 18 |
| 25 | 259 | 65 | 41 | 177 | 17 |
| 50 | 640 | 147 | 137 | 614 | 47 |
| 100 | 1736 | 310 | 196 | 641 | 100 |
| 200 | 2747 | 1015 | 332 | 1610 | 179 |

**الإنتاجية القصوى:** لوحة التحكم ~110 RPS · البحث ~590 RPS · التقارير ~955 RPS · حصة AI ~1900 RPS

### نقطة الانهيار — تنافس على مولدة واحدة

| التزامن | قبل ضبط المعاملات | بعد |
|---|---|---|
| 100 | 0 فشل | 0 فشل، P95 1.29s |
| 200 | **58 فشل (29%)** `P2028` | **0 فشل**، P95 3.14s |
| 400 | **258 فشل (64.5%)** `P2028` | **0 فشل**، P95 7.16s |

**السبب الجذري:** `maxWait` الافتراضي (2s) مقابل `pool_timeout` (20s). التوحيد حوّل الفشل إلى انتظار. **الصحة لم تُخترق في أي مستوى: صفر P2002، صفر ازدواج.**

### إنتاجية الفوترة
**3,761 فاتورة/ثانية** · **23 مولدة/ثانية** (3 workers)

استقراء: 10,000 مولدة ≈ 435 ثانية عمل موزّعة. بميزانية 45s لكل استدعاء وcron كل 5 دقائق ⇒ الدورة تكتمل خلال أقل من ساعة. **استقراء لا قياس.**

---

## 12. المخاطر المتبقية والقرارات

### 🔴 يحتاج قرارك

**1. Caching (P2-2 / P2-4)** — لم أنفّذه.
لوحة التحكم صارت 14 استعلامًا تجميعيًا (P95 = 640ms عند 50 متزامن). قد يكفي هذا بلا كاش.
- **A:** TTL قصير (5–30s) — بسيط، أرقام مالية متأخرة قليلًا
- **B:** كاش + إبطال فوري بعد كل mutation مالية — دقيق، لكن mutation منسية = رقم خاطئ ظاهر
- **توصيتي:** لا شيء الآن؛ القرار بعد قياس على staging

**2. خطة Vercel** — `*/5` للـ worker يتطلب Pro.

**3. `aiRequestLimit: 2000` لخطة Pro** — قيمة مبدئية وضعتها، قرار تجاري يخصك.

**4. سقف اتصالات Supavisor** — تحقق منه لتثبيت `connection_limit`.

### 🟡 مخاطر معروفة
- **Capacity على Vercel غير مثبتة** — الأرقام أعلاه لقاعدة البيانات فقط
- `AI_DEFAULT_MONTHLY_LIMIT` فارغ = بلا حد للمولدات بلا اشتراك منصّة (يحافظ على السلوك القائم)
- سجل التدقيق بلا حذف تلقائي **بقرار مقصود** — انظر سياسة الاحتفاظ في §12ب
- عدّ سجل التدقيق تقريبي (`reltuples`) — للعرض فقط

---

## 12ب. سياسة الاحتفاظ بالبيانات

جداول تُكتب دوريًا ولا تتقلّص كانت تنمو بلا حد — منها `CronRun` و`BillingJob` اللذان
أنشأتُهما ونسيتُ تنظيفهما. `lib/domain/retention.ts` يعمل ضمن الـ cron اليومي:

| الجدول | السياسة | المبرر |
|---|---|---|
| `CronRun` (غير الفاشلة) | 30 يومًا | قياس تشغيلي بحت. الفاشلة **تبقى** — دليل العطل الوحيد |
| `BillingJob` (DONE فقط) | 90 يومًا | الفواتير هي السجل الدائم. FAILED **تبقى بلا حد** |
| `Notification` (المقروءة فقط) | 90 يومًا | حالة واجهة مؤقتة. غير المقروءة **تبقى دائمًا** |
| `AuditLog` | **لا حذف إطلاقًا** | سجل أمني ومالي — حذفه يُفقد القدرة على التحقيق |
| `Invoice` / `Payment` / `LedgerEntry` | **لا حذف إطلاقًا** | سجل مالي دائم بحكم التصميم |

كل الحدود قابلة للضبط، والحذف محدود بـ 10,000 صف لكل تشغيل حتى لا يقفل الجدول طويلًا.
حذف عمل فوترة مكتمل آمن: إعادة إدراج دورة قديمة لا تُنتج فواتير مكررة بفضل القيد الفريد.

---

## 13. متغيرات البيئة

```bash
# قاعدة البيانات — الضبط في lib/db.ts، والعنوان للاتصال فقط
DATABASE_URL=                  # Supavisor :6543
DIRECT_URL=                    # :5432 للـ migrations
DATABASE_CONNECTION_LIMIT=     # اختياري، افتراضي 5
DATABASE_POOL_TIMEOUT=         # اختياري، افتراضي 20 (ثانية)
DATABASE_TX_MAX_WAIT_MS=       # اختياري، افتراضي 10000
DATABASE_TX_TIMEOUT_MS=        # اختياري، افتراضي 20000

# الاختبارات
DATABASE_URL_TEST=             # اتصال مباشر فقط، لا pooler
ALLOW_REMOTE_TEST_DB=          # "yes" للسماح بمضيف بعيد

# المساعد الذكي
ANTHROPIC_API_KEY=
AI_TIMEOUT_MS=                 # اختياري، افتراضي 20000
AI_RATE_LIMIT_PER_MINUTE=      # اختياري، افتراضي 10
AI_DEFAULT_MONTHLY_LIMIT=      # اختياري، فارغ = بلا حد

CRON_SECRET=                   # إلزامي — بدونه تُرفض كل الـ cron (503)

# الاحتفاظ بالبيانات (اختيارية — القيم الافتراضية معقولة)
RETENTION_CRON_RUNS_DAYS=          # افتراضي 30
RETENTION_BILLING_JOBS_DAYS=       # افتراضي 90
RETENTION_READ_NOTIFICATIONS_DAYS= # افتراضي 90
```

---

## 14. ما أحتاجه منك لإكمال ما تبقّى

اختبار الحمل على Vercel هو الوحيد المتبقي، ويتطلب:

1. **مشروع Supabase للـ staging** (منفصل عن الإنتاج) + سقف اتصالات خطتك
2. **نشر Vercel على staging** + `CRON_SECRET`
3. **خطة Vercel** (لتحديد `maxDuration` وتكرار الـ cron)

عندها يمكن قياس: البدء البارد · مدة الدوال · تزامن الـ instances · زمن Vercel↔Supabase · سلوك Supavisor تحت الضغط — ثم إصدار تقرير capacity حقيقي.

---

## 15. الحكم النهائي

**ما أُثبت:**
- نقاط الانهيار العشر في التدقيق الأصلي أُزيلت، ومعها 11 مشكلة إضافية لم يذكرها
- الصحة تحت التزامن مُثبتة على PostgreSQL حقيقية: صفر ازدواج فواتير، صفر تعارض أرقام، صفر تجاوز حصص، صفر تسرب بين المستأجرين
- الفوترة قابلة للاستئناف والتعافي بعد موت الدالة
- خطط تنفيذ الاستعلامات الحرجة مقيسة ومُحسَّنة

**ما لم يُثبت:**
- سلوك النظام على Vercel تحت حمل حقيقي
- **Capacity غير مثبتة.**

**لا أستطيع قول "النظام يتحمل 20,000 مشترك" ولا "Production Ready"** — الأدلة الحالية لا تسمح بذلك. ما أستطيع قوله: **العوائق البنيوية التي كانت تجعل التوسع مستحيلًا أُزيلت وأُثبت ذلك بالقياس، وما تبقّى هو التحقق من البيئة.**
