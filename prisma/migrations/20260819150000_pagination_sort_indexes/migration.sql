-- فهارس تخدم أنماط ترتيب/تصفيح فعلية في الكود — لا فهرسة استباقية.
--
-- customers(workspaceId, createdAt)
--   يخدم: الترتيب الافتراضي لقائمة المشتركين (ORDER BY createdAt DESC داخل المولدة)،
--         واستعلامات النمو الشهري في لوحة التحكم (createdAt < X داخل المولدة).
--   الكلفة: جدول يُكتب فيه نادرًا (إضافة مشترك) ويُقرأ كثيرًا. مبرَّر.
--
-- notifications(workspaceId, createdAt)
--   يخدم: صفحة الإشعارات (ORDER BY createdAt DESC داخل المولدة).
--   الجدول ينمو يوميًا من الـ cron، والفهرس القائم [workspaceId, userId, readAt]
--   لا يخدم الترتيب الزمني. مبرَّر.
--
-- audit_logs(createdAt)
--   يخدم: لوحة المنصّة التي تُرتّب عالميًا بلا فلتر workspace — بدونه يلزم فرز كامل
--   لأكبر جدول في المنصّة عند كل تحميل صفحة. مبرَّر.
--
-- لم تُضَف فهارس لـ support_tickets(updatedAt): عدد التذاكر لكل مولدة صغير عمليًا،
-- وكلفة الفرز عليه لا تبرر فهرسًا إضافيًا.

-- CreateIndex
CREATE INDEX "customers_workspaceId_createdAt_idx" ON "customers"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_workspaceId_createdAt_idx" ON "notifications"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
