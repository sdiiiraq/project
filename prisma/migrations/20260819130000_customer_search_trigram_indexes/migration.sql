-- بحث المشتركين يستخدم contains (substring)، وفهرس B-tree لا يخدمه إطلاقًا:
--   name:    ILIKE '%q%'   →  فحص كامل لصفوف المولدة
--   phone:   LIKE  '%q%'   →  فحص كامل لصفوف المولدة
-- pg_trgm يبني فهرس trigram يستطيع خدمة هذا النمط.
--
-- تعليل اختيار الأعمدة (لا فهرسة عمياء):
--   ✅ name          — نص طويل، تمييز عالٍ، أكثر أعمدة البحث استخدامًا. الفهرس مبرَّر.
--   ✅ phone         — أرقام متمايزة بطول كافٍ، بحث شائع. الفهرس مبرَّر.
--   ❌ subscriberNumber — أربعة محارف مصفوفة بأصفار. عدد الthigrams ضئيل والانتقائية شبه
--                        معدومة، والقيد الفريد @@unique([workspaceId, subscriberNumber])
--                        يخدم المطابقة التامة والبادئة أصلًا. فهرس trigram هنا تكلفة بلا عائد.
--   ❌ houseNumber     — قيم قصيرة جدًا ومتكررة ("12"، "3")؛ انتقائية ضعيفة، والعائد لا يبرر
--                        كلفة الكتابة والتخزين.
--
-- كلفة الكتابة: فهارس GIN أثقل في الكتابة من B-tree. مقبولة هنا لأن صفوف customers
-- تُكتب نادرًا (إضافة مشترك) وتُقرأ كثيرًا (بحث).
--
-- ⚠️ عند التطبيق على قاعدة بيانات كبيرة الحجم: CREATE INDEX يقفل الكتابة على الجدول
-- طوال بناء الفهرس. Prisma يُغلّف كل ترحيل في معاملة فلا يمكن استخدام CONCURRENTLY هنا.
-- إن كان الجدول ضخمًا وقت التطبيق، شغّل الفهرسين يدويًا بـ CREATE INDEX CONCURRENTLY
-- خارج Prisma ثم علّم الترحيل كمُطبَّق (prisma migrate resolve --applied).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers" USING GIN ("phone" gin_trgm_ops);
