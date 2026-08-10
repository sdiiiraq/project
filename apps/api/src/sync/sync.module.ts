import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [PaymentsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
