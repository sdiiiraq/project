import {
  ArgumentsHost, BadRequestException, Catch, ExceptionFilter, ForbiddenException,
  HttpException, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppException, ErrorCodes } from './errors';
import { ErrorTrackingService } from './error-tracking';
import type { AppRequest } from './types';

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

/**
 * موحد الأخطاء (§73/§74). لا يكشف stack traces للعملاء في production.
 * التفاصيل التطويرية تبقى في السجلات فقط مع requestId (§182).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly errorTracking?: ErrorTrackingService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<AppRequest>();
    const requestId = req.id ?? req.requestId;

    let status = 500;
    let code: string = ErrorCodes.INTERNAL_ERROR;
    let message = 'حدث خطأ داخلي، الرجاء المحاولة لاحقاً';
    let details: unknown;

    if (exception instanceof AppException) {
      status = exception.httpStatus;
      code = exception.code;
      message = exception.messageText;
      details = exception.details;
    } else if (exception instanceof UnauthorizedException) {
      status = 401;
      code = ErrorCodes.AUTHENTICATION_REQUIRED;
      message = 'تسجيل الدخول مطلوب';
    } else if (exception instanceof ForbiddenException) {
      status = 403;
      code = ErrorCodes.FORBIDDEN;
      message = 'غير مصرح بهذه العملية';
    } else if (exception instanceof NotFoundException) {
      status = 404;
      code = ErrorCodes.RESOURCE_NOT_FOUND;
      message = 'المورد غير موجود';
    } else if (exception instanceof BadRequestException) {
      status = 422;
      code = ErrorCodes.VALIDATION_ERROR;
      message = 'المدخلات غير صالحة';
      details = exception.getResponse();
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status === 409 ? ErrorCodes.CONFLICT : ErrorCodes.VALIDATION_ERROR;
      message = exception.message;
    }

    if (status >= 500) {
      req.log?.error({ err: exception, requestId }, 'Unhandled server error');
      this.errorTracking?.capture(exception, { requestId, path: req.path });
    }

    const body: ErrorBody = { success: false, error: { code, message, details }, requestId };
    res.status(status).json(body);
  }
}
