import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AppRequest, AuthUser as AuthUserPayload } from './types';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';
export const RAW_RESPONSE_KEY = 'rawResponse';

/** مسار عام بدون مصادقة (login/register/health...) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** الصلاحيات المطلوبة — تُفرض في الـ backend دائمًا (§10) */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** استجابة خام (تنزيل ملفات) — لا تُغلف بتنسيق JSON الموحّد */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);

export const AuthUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserPayload => {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) {
      throw new Error('AuthUser used on an unauthenticated route');
    }
    return req.user;
  },
);
