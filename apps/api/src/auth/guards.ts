import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../common/decorators';
import { AppException, ErrorCodes } from '../common/errors';
import type { AuthUser } from '../common/types';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest<TUser = AuthUser>(err: unknown, user: TUser | false): TUser {
    const anyErr = err as { name?: string } | null;
    if (anyErr?.name === 'TokenExpiredError') {
      throw new AppException(ErrorCodes.TOKEN_EXPIRED, 'انتهت صلاحية رمز الدخول', 401);
    }
    if (err || !user) {
      throw new AppException(ErrorCodes.AUTHENTICATION_REQUIRED, 'تسجيل الدخول مطلوب', 401);
    }
    return user;
  }
}

/**
 * فرض الصلاحيات في الـ backend (§10/§11). فحص الواجهة الأمامية لا يكفي أبدًا.
 * ملاحظة موثقة: الصلاحيات تُحمّل في الـ access token وتصبح نافذة خلال مدة
 * صلاحية الرمز — إبطال الجلسات فوري عبر refresh revocation.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user) return false;

    // SUPER_ADMIN نطاقه المنصة فقط (§199) — يمر هنا ويُراقب بالتدقيق
    if (user.roles.includes('SUPER_ADMIN')) return true;

    const allowed = required.every((p) => user.permissions.includes(p));
    if (!allowed) {
      throw new AppException(ErrorCodes.INSUFFICIENT_PERMISSION, 'ليست لديك صلاحية كافية لهذه العملية', 403);
    }
    return true;
  }
}
