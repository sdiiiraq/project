import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingConfigService } from './billing-config.service';
import { BillingCronController } from './billing-cron.controller';
import { BillingTasksService } from './billing-tasks.service';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';

@Module({
  imports: [NotificationsModule],
  controllers: [BillsController, BillingCronController],
  providers: [BillsService, BillingConfigService, BillingTasksService],
  exports: [BillsService, BillingConfigService],
})
export class BillingModule {}
