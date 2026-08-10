import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type express from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppException, ErrorCodes } from './common/errors';
import { ResponseInterceptor } from './common/response.interceptor';
import { ErrorTrackingService } from './common/error-tracking';

/**
 * الإعداد المشترك للتطبيق — يُستخدم من مسارين:
 *  1) main.ts: تشغيل تقليدي (nest start) للتطوير المحلي.
 *  2) api/[...path].ts: دالة Vercel Serverless في الإنتاج (بدون app.listen).
 * هذا الفصل يمنع ازدواج الإعداد ويضمن تطابق سلوك enableCors/الأنابيب/المرشحات
 * بين البيئتين.
 */
export async function configureApp(app: INestApplication): Promise<void> {
  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new AppException(
          ErrorCodes.VALIDATION_ERROR,
          'المدخلات غير صالحة',
          422,
          errors.map((e) => ({ field: e.property, errors: Object.values(e.constraints ?? {}) })),
        ),
    }),
  );

  const errorTracking = app.get(ErrorTrackingService);
  app.useGlobalFilters(new AllExceptionsFilter(errorTracking));
  app.useGlobalInterceptors(new ResponseInterceptor());

  // توثيق OpenAPI (§116): متاح في التطوير فقط إلا إذا فُعّل صراحة في الإنتاج
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Iraq Generator Operations SaaS API')
      .setDescription(
        'REST API v1 — مصادقة Bearer، عزل مستأجرين، وصلاحيات مفصلة. المخططات مولدة تلقائيًا من DTOs عبر swagger plugin.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access Token' },
        'access-token',
      )
      .addTag('auth', 'المصادقة والجلسات')
      .addTag('billing', 'الفوترة')
      .addTag('payments', 'الدفعات')
      .addTag('collections', 'التحصيل والمطابقات')
      .addTag('reports', 'التقارير')
      .addTag('exports', 'التصدير')
      .addTag('sync', 'المزامنة دون اتصال')
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, documentFactory, {
      swaggerOptions: { persistAuthorization: true },
    });
  }
}

/**
 * ينشئ تطبيق Nest فوق محول Express معطى (المستخدَم من الدالة اللاخادومية)،
 * أو فوق خادم Express جديد عند عدم تمرير واحد (main.ts).
 * لا يستدعي app.listen ولا enableShutdownHooks هنا — هذه مسؤولية المستدعي،
 * لأن سلوكهما يختلف بين بيئة خادوم دائم وبيئة لاخادومية.
 */
export async function createApp(expressInstance?: express.Express): Promise<NestExpressApplication> {
  const { ExpressAdapter } = await import('@nestjs/platform-express');
  const adapter = expressInstance ? new ExpressAdapter(expressInstance) : new ExpressAdapter();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, adapter, {
    bodyParser: true,
  });
  await configureApp(app);
  return app;
}
