-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "subscriberSequence" INTEGER NOT NULL DEFAULT 0;

-- Backfill: يجب أن يبدأ العدّاد من أعلى رقم مشترك مستخدم فعليًا في كل مولدة.
-- بدون هذا، أول مشترك يُضاف بعد الترحيل سيحصل على الرقم 0001 ويصطدم بالقيد الفريد
-- @@unique([workspaceId, subscriberNumber]).
--
-- نستخدم MAX(الرقم كعدد) وليس COUNT(*): إذا سبق حذف صفوف نهائيًا أو نشأ فراغ في الترقيم،
-- فإن COUNT سيُعيد إصدار رقم مستخدم مسبقًا، بينما MAX يضمن أن الرقم التالي غير مستخدم.
-- الأرقام غير الرقمية (إن وُجدت) تُعامل كصفر بدل أن تُفشل الترحيل.
UPDATE "workspaces" w
SET "subscriberSequence" = COALESCE((
  SELECT MAX(
    CASE WHEN c."subscriberNumber" ~ '^[0-9]+$'
         THEN c."subscriberNumber"::bigint
         ELSE 0
    END
  )
  FROM "customers" c
  WHERE c."workspaceId" = w."id"
), 0);
