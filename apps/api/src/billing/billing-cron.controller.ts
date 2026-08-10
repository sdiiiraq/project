import { Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { Public } from '../common/decorators';
import { BillingTasksService } from './billing-tasks.service';

/**
 * نقطة استدعاء داخلية لـ Vercel Cron Jobs (§92). مُعرَّفة كـ @Public لأنها
 * لا تحمل توكن JWT مستخدم — الحماية هنا عبر مقارنة سر مشترك (CRON_SECRET)
 * يُرسله Vercel تلقائيًا في ترويسة Authorization لكل استدعاء cron مُهيّأ في
 * vercel.json. أي طلب بلا السر الصحيح يُرفض بـ 401.
 */
@Controller('internal/cron')
export class BillingCronController {
  constructor(private readonly billingTasks: BillingTasksService) {}

  @Public()
  @Post('billing-overdue-sweep')
  async billingOverdueSweep(@Headers('authorization') authorization?: string): Promise<{ ok: true }> {
    const expected = process.env.CRON_SECRET;
    if (!expected || authorization !== `Bearer ${expected}`) {
      throw new UnauthorizedException('استدعاء غير مصرح به لمهمة الفوترة المجدولة');
    }
    await this.billingTasks.dailyOverdueSweep();
    return { ok: true };
  }
}
