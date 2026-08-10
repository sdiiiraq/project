import { Module } from '@nestjs/common';
import { NotificationsController } from './notification.controller';
import { NotificationsService } from './notification.service';
import { DevEmailProvider, DevSmsProvider, DevWhatsAppProvider, NotificationProviderRegistry } from './providers';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationProviderRegistry, DevSmsProvider, DevWhatsAppProvider, DevEmailProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
