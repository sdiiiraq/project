import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillsService } from './bills.service';

/**
 * المهام المجدولة للفوترة (§92):
 * - كشف المتأخرات يوميًا، idempotent — تشغيله مرتين لا يكرر النتائج.
 *
 * ملاحظة توافق Vercel: كانت هذه المهمة تعمل سابقًا عبر @Cron داخل العملية
 * (@nestjs/schedule)، وهو أسلوب لا يعمل على استضافة لاخادومية لأن العملية
 * لا تبقى حيّة لتشغيل مؤقّت داخلي. استُبدلت بنقطة HTTP محمية
 * (BillingCronController) يستدعيها Vercel Cron Jobs يوميًا حسب الجدول في
 * vercel.json — المنطق نفسه محفوظ بالكامل، فقط آلية الاستدعاء تغيّرت.
 */
@Injectable()
export class BillingTasksService {
  private readonly logger = new Logger('BillingTasks');

  constructor(
    private readonly prisma: PrismaService,
    private readonly bills: BillsService,
  ) {}

  async dailyOverdueSweep(): Promise<void> {
    const orgs = await this.prisma.organization.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const org of orgs) {
      try {
        await this.bills.sweepOverdue(org.id, null);
      } catch (e) {
        this.logger.error(JSON.stringify({ orgId: org.id, error: e instanceof Error ? e.message : 'sweep failure' }));
      }
    }
  }
}
