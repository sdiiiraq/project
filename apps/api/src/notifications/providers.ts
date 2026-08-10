import { Injectable, Logger } from '@nestjs/common';

/**
 * واجهة مزود إشعارات مجردة (§106). منطق الأعمال لا يرتبط بمزود محدد.
 * عند عدم توافر مزود حقيقي تُستخدم محولات تطوير آمنة تسجّل فقط
 * ولا تدّعي تسليمًا ناجحًا في الإنتاج (§106/§191).
 */
export interface NotificationProvider {
  readonly channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
  send(to: string, message: string): Promise<void>;
}

@Injectable()
export class DevSmsProvider implements NotificationProvider {
  readonly channel = 'SMS' as const;
  private readonly logger = new Logger('DevSmsProvider');
  async send(to: string, message: string): Promise<void> {
    this.logger.log(`[DEV SMS] to=${to} message=${message}`);
  }
}

@Injectable()
export class DevWhatsAppProvider implements NotificationProvider {
  readonly channel = 'WHATSAPP' as const;
  private readonly logger = new Logger('DevWhatsAppProvider');
  async send(to: string, message: string): Promise<void> {
    this.logger.log(`[DEV WhatsApp] to=${to} message=${message}`);
  }
}

@Injectable()
export class DevEmailProvider implements NotificationProvider {
  readonly channel = 'EMAIL' as const;
  private readonly logger = new Logger('DevEmailProvider');
  async send(to: string, message: string): Promise<void> {
    this.logger.log(`[DEV Email] to=${to} message=${message}`);
  }
}

@Injectable()
export class NotificationProviderRegistry {
  private readonly providers = new Map<string, NotificationProvider>();

  constructor(sms: DevSmsProvider, whatsapp: DevWhatsAppProvider, email: DevEmailProvider) {
    this.providers.set('SMS', sms);
    this.providers.set('WHATSAPP', whatsapp);
    this.providers.set('EMAIL', email);
  }

  async send(channel: string, to: string, message: string): Promise<void> {
    const provider = this.providers.get(channel);
    if (!provider) return;
    try {
      await provider.send(to, message);
    } catch {
      // فشل المزود الخارجي لا يكسر المعاملة الداخلية (§191)
    }
  }
}
