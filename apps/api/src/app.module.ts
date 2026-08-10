import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { randomUUID } from 'crypto';
import pinoHttp from 'pino-http';
import path from 'path';

import { envSchema } from './config/env.schema';
import { JwtAuthGuard, PermissionsGuard } from './auth/guards';
import { ThrottlerGuard } from './common/throttler.guard';
import { ThrottlerService } from './common/throttler.service';
import { ErrorTrackingService } from './common/error-tracking';

import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { GeneratorsModule } from './generators/generators.module';
import { CustomersModule } from './customers/customers.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PlansModule } from './plans/plans.module';
import { BillingModule } from './billing/billing.module';
import { PaymentsModule } from './payments/payments.module';
import { CollectionsModule } from './collections/collections.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FuelModule } from './fuel/fuel.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { OperationsModule } from './operations/operations.module';
import { EmployeesModule } from './employees/employees.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FilesModule } from './files/files.module';
import { ExportsModule } from './exports/exports.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', path.resolve(process.cwd(), '../../.env')],
      validate: (cfg: Record<string, unknown>) => envSchema.parse(cfg),
    }),
    PrismaModule,
    CommonModule,
    AuditModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    GeneratorsModule,
    CustomersModule,
    SubscriptionsModule,
    PlansModule,
    BillingModule,
    PaymentsModule,
    CollectionsModule,
    ExpensesModule,
    FuelModule,
    MaintenanceModule,
    OperationsModule,
    EmployeesModule,
    NotificationsModule,
    ReportsModule,
    DashboardModule,
    FilesModule,
    ExportsModule,
    SyncModule,
  ],
  providers: [
    // ترتيب التنفيذ: المصادقة ثم المعدل ثم الصلاحيات (§10/§81)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    ThrottlerService,
    ErrorTrackingService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        pinoHttp({
          level: process.env.LOG_LEVEL ?? 'info',
          genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
          autoLogging: { ignore: (req) => req.url.startsWith('/api/v1/health') },
          // لا نسجل الأسرار أبدًا (§127)
          redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash'],
        }),
      )
      .forRoutes('*');
  }
}
