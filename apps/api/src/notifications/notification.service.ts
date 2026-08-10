import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationProviderRegistry } from './providers';

type NotificationTypeValue =
  | 'BILL_CREATED' | 'PAYMENT_RECEIVED' | 'PAYMENT_RECEIPT' | 'PAYMENT_REMINDER'
  | 'OVERDUE' | 'OUTAGE' | 'MAINTENANCE' | 'SYSTEM';

/**
 * خدمة الإشعارات (§37). إرسال الإشعار لا يعيق إنشاء الدفعة/الفاتورة (§77/§190)،
 * وفشله لا يفسد الحالة المالية (§78) — كل الأخطاء تُلتقط وتُسجَّل.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: NotificationProviderRegistry,
  ) {}

  async notifyBillIssued(organizationId: string, customerId: string, billId: string, billNumber: string, totalAmount: string, dueDate: Date): Promise<void> {
    try {
      await this.createInApp(organizationId, customerId, 'BILL_CREATED', `فاتورة جديدة ${billNumber}`, `تم إصدار فاتورة بمبلغ ${totalAmount} تستحق في ${dueDate.toISOString().slice(0, 10)}`, { billId });
      await this.dispatchExternal(organizationId, customerId, `فاتورة جديدة ${billNumber} بمبلغ ${totalAmount}`);
    } catch (e) {
      this.logger.warn(`notifyBillIssued failed for bill ${billId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async notifyPaymentReceived(organizationId: string, customerId: string, paymentId: string, amount: string, receiptNumber?: string): Promise<void> {
    try {
      await this.createInApp(organizationId, customerId, 'PAYMENT_RECEIVED', 'تم استلام دفعة', `تم استلام دفعة بمبلغ ${amount}${receiptNumber ? ` (وصل ${receiptNumber})` : ''}`, { paymentId });
      await this.dispatchExternal(organizationId, customerId, `تم استلام دفعتك بمبلغ ${amount}. شكرًا لك.`);
    } catch (e) {
      this.logger.warn(`notifyPaymentReceived failed for payment ${paymentId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async notifyOverdue(organizationId: string, customerId: string, billId: string, billNumber: string, outstanding: string): Promise<void> {
    try {
      await this.createInApp(organizationId, customerId, 'OVERDUE', `فاتورة متأخرة ${billNumber}`, `الفاتورة ${billNumber} متأخرة والمبلغ المستحق ${outstanding}`, { billId });
      await this.dispatchExternal(organizationId, customerId, `تذكير: الفاتورة ${billNumber} متأخرة، المبلغ المستحق ${outstanding}`);
    } catch (e) {
      this.logger.warn(`notifyOverdue failed for bill ${billId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async createInApp(organizationId: string, customerId: string, type: NotificationTypeValue, title: string, body: string, payload: Record<string, unknown>): Promise<void> {
    await this.prisma.notification.create({
      data: {
        organizationId,
        customerId,
        type,
        channel: 'IN_APP',
        title,
        body,
        payload: payload as Prisma.InputJsonValue,
        status: 'QUEUED',
      },
    });
  }

  /** احترم تفضيلات المشترك (§38): الإرسال الخارجي فقط لمن فعّل القناة صراحةً */
  private async dispatchExternal(organizationId: string, customerId: string, message: string): Promise<void> {
    const [prefs, customer] = await Promise.all([
      this.prisma.notificationPreference.findFirst({ where: { customerId } }),
      this.prisma.customer.findFirst({ where: { id: customerId }, select: { phonePrimary: true } }),
    ]);
    if (!customer?.phonePrimary) return;
    if (prefs?.smsEnabled) await this.providers.send('SMS', customer.phonePrimary, message);
    if (prefs?.whatsappEnabled) await this.providers.send('WHATSAPP', customer.phonePrimary, message);
  }

  async listForOrg(organizationId: string) {
    return this.prisma.notification.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(organizationId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, organizationId },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
