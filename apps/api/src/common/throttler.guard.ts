import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException, ErrorCodes } from './errors';
import { ThrottlerService } from './throttler.service';

/**
 * حدود صارمة للمسارات الحساسة (§81):
 * auth: لكل IP · رفع الملفات: لكل مستخدم · عام: لكل مستخدم/آي بي.
 */
@Injectable()
export class ThrottlerGuard implements CanActivate {
  constructor(
    private readonly throttler: ThrottlerService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip: string = req.ip ?? 'unknown';
    const path: string = req.path ?? req.url ?? '';
    const user = req.user as { userId?: string } | undefined;
    const windowSeconds = 60;

    let bucket: string;
    let limit: number;

    if (path.startsWith('/api/v1/auth')) {
      bucket = `rl:auth:${ip}`;
      limit = Number(this.config.get('RATE_LIMIT_AUTH_MAX') ?? 10);
    } else if (path.startsWith('/api/v1/files/upload')) {
      bucket = `rl:upload:${user?.userId ?? ip}`;
      limit = 10;
    } else {
      bucket = `rl:global:${user?.userId ?? ip}`;
      limit = Number(this.config.get('RATE_LIMIT_GLOBAL_MAX') ?? 300);
    }

    const allowed = await this.throttler.hit(bucket, windowSeconds, limit);
    if (!allowed) {
      throw new AppException(ErrorCodes.RATE_LIMITED, 'عدد الطلبات مرتفع — الرجاء المحاولة بعد قليل', 429);
    }
    return true;
  }
}
