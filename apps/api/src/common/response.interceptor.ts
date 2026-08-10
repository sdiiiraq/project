import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RAW_RESPONSE_KEY } from './decorators';
import type { AppRequest } from './types';

/** تنسيق الاستجابة الموحّد (§73) مع تجاوز للمسارات الخام (التنزيلات) */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isRaw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isRaw) return next.handle();

    return next.handle().pipe(
      map((data) => {
        const req = context.switchToHttp().getRequest<AppRequest>();
        const requestId = req.id ?? req.requestId;
        const isEnvelope =
          data !== null &&
          typeof data === 'object' &&
          ('data' in data || 'meta' in data) &&
          Object.keys(data).every((k) => k === 'data' || k === 'meta');

        if (isEnvelope) {
          return { success: true, ...data, meta: { ...(data.meta ?? {}), requestId } };
        }
        return { success: true, data: data ?? null, meta: { requestId } };
      }),
    );
  }
}
