import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { hashPassword, verifyPassword } from '../common/security';
import type { RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangePasswordDto, ForgotPasswordDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto,
} from './dto';

type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } };
}>;

const ROLE_INCLUDE = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} as const;

const OWNER_ROLE = 'ORGANIZATION_OWNER';

export interface SanitizedUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  organizationId: string | null;
  status: string;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private uniquePermissions(user: UserWithRoles): string[] {
    return [...new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)))];
  }

  private sanitizeUser(user: UserWithRoles): SanitizedUser {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      organizationId: user.organizationId,
      status: user.status,
      roles: user.roles.map((ur) => ur.role.name),
      permissions: this.uniquePermissions(user),
    };
  }

  private buildAccessToken(user: UserWithRoles): Promise<string> {
    const roles = user.roles.map((ur) => ur.role.name);
    const permissions = this.uniquePermissions(user);
    const ttl = Number(this.config.get('ACCESS_TOKEN_TTL_SECONDS') ?? 900);
    return this.jwt.signAsync(
      { sub: user.id, organizationId: user.organizationId, roles, permissions, type: 'access' },
      { expiresIn: ttl },
    );
  }

  private async storeRefreshToken(
    tx: Prisma.TransactionClient,
    user: { id: string; organizationId: string | null },
    meta: RequestMeta,
  ): Promise<string> {
    const refreshToken = randomBytes(48).toString('base64url');
    const days = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);
    await tx.refreshToken.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        tokenHash: this.sha256(refreshToken),
        deviceId: meta.deviceId,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });
    return refreshToken;
  }

  /** تسجيل منظمة جديدة + مالكها (§61) */
  async register(dto: RegisterDto, meta: RequestMeta) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new AppException(ErrorCodes.DUPLICATE_RESOURCE, 'رقم الهاتف مسجّل مسبقاً', 409);
    }

    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: dto.organizationName, phone: dto.phone },
      });
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          name: dto.name,
          phone: dto.phone,
          passwordHash: await hashPassword(dto.password),
          status: 'ACTIVE',
        },
      });
      const ownerRole = await tx.role.findUnique({ where: { name: OWNER_ROLE } });
      if (!ownerRole) {
        throw new AppException(ErrorCodes.INTERNAL_ERROR, 'أدوار النظام غير مهيأة — قم بتشغيل seed أولاً', 500);
      }
      await tx.userRole.create({ data: { userId: user.id, roleId: ownerRole.id, organizationId: organization.id } });

      await this.audit.log({
        tx, organizationId: organization.id, actorUserId: user.id,
        action: 'organization.create', entityType: 'Organization', entityId: organization.id,
        after: { name: organization.name }, meta,
      });
      await this.audit.log({
        tx, organizationId: organization.id, actorUserId: user.id,
        action: 'auth.register', entityType: 'User', entityId: user.id, meta,
      });

      const fullUser = (await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { ...ROLE_INCLUDE },
      })) as unknown as UserWithRoles;

      const accessToken = await this.buildAccessToken(fullUser);
      const refreshToken = await this.storeRefreshToken(tx, user, meta);

      return {
        user: this.sanitizeUser(fullUser),
        organization: { id: organization.id, name: organization.name },
        accessToken,
        refreshToken,
      };
    });
  }

  async login(dto: LoginDto, meta: RequestMeta) {
    const user = (await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: { organization: true, ...ROLE_INCLUDE },
    })) as unknown as
      | (UserWithRoles & { organization: { id: string; name: string; status: string } | null })
      | null;

    const invalid = () => new AppException(ErrorCodes.INVALID_CREDENTIALS, 'بيانات الدخول غير صحيحة', 401);
    if (!user || !user.passwordHash) throw invalid();

    const ok = await verifyPassword(user.passwordHash, dto.password);
    if (!ok) {
      await this.audit.log({
        organizationId: user.organizationId, actorUserId: user.id,
        action: 'auth.login_failed', entityType: 'User', entityId: user.id, meta,
      });
      throw invalid();
    }
    if (user.status !== 'ACTIVE') throw new AppException(ErrorCodes.FORBIDDEN, 'الحساب موقوف', 403);
    if (!user.organization || user.organization.status !== 'ACTIVE') {
      throw new AppException(ErrorCodes.FORBIDDEN, 'المنظمة موقوفة', 403);
    }

    const tokens = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await this.audit.log({
        tx, organizationId: user.organizationId, actorUserId: user.id,
        action: 'auth.login', entityType: 'User', entityId: user.id, meta,
      });
      const accessToken = await this.buildAccessToken(user);
      const refreshToken = await this.storeRefreshToken(tx, user, meta);
      return { accessToken, refreshToken };
    });

    return {
      user: this.sanitizeUser(user),
      organization: { id: user.organization.id, name: user.organization.name },
      ...tokens,
    };
  }

  /** تدوير رمز التحديث (§79) — الرمز القديم يُبطل فورًا */
  async refresh(dto: RefreshDto, meta: RequestMeta) {
    const stored = (await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.sha256(dto.refreshToken) },
      include: { user: { include: { ...ROLE_INCLUDE } } },
    })) as unknown as {
      id: string; userId: string; organizationId: string | null; revokedAt: Date | null; expiresAt: Date;
      user: UserWithRoles & { status: string };
    } | null;

    if (!stored) throw new AppException(ErrorCodes.AUTHENTICATION_REQUIRED, 'جلسة غير صالحة', 401);
    if (stored.revokedAt) throw new AppException(ErrorCodes.AUTHENTICATION_REQUIRED, 'تم إبطال هذه الجلسة', 401);
    if (stored.expiresAt <= new Date()) throw new AppException(ErrorCodes.TOKEN_EXPIRED, 'انتهت صلاحية الجلسة', 401);
    if (stored.user.status !== 'ACTIVE') throw new AppException(ErrorCodes.FORBIDDEN, 'الحساب موقوف', 403);

    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
      const accessToken = await this.buildAccessToken(stored.user as unknown as UserWithRoles);
      const refreshToken = await this.storeRefreshToken(tx, stored, meta);
      return { accessToken, refreshToken };
    });
  }

  async logout(dto: RefreshDto, meta: RequestMeta): Promise<{ loggedOut: boolean }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.sha256(dto.refreshToken) },
    });
    if (stored && !stored.revokedAt) {
      await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
      await this.audit.log({
        organizationId: stored.organizationId, actorUserId: stored.userId,
        action: 'auth.logout', entityType: 'RefreshToken', entityId: stored.id, meta,
      });
    }
    return { loggedOut: true };
  }

  async me(userId: string) {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true, ...ROLE_INCLUDE },
    })) as unknown as
      | (UserWithRoles & { organization: { id: string; name: string } | null })
      | null;
    if (!user) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المستخدم غير موجود', 404);
    return {
      user: this.sanitizeUser(user),
      organization: user.organization ? { id: user.organization.id, name: user.organization.name } : null,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, meta: RequestMeta): Promise<{ changed: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المستخدم غير موجود', 404);

    const ok = await verifyPassword(user.passwordHash, dto.currentPassword);
    if (!ok) throw new AppException(ErrorCodes.INVALID_CREDENTIALS, 'كلمة المرور الحالية غير صحيحة', 401);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(dto.newPassword) } });
      // إبطال كل الجلسات بعد تغيير كلمة المرور (§113-46)
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({
        tx, organizationId: user.organizationId, actorUserId: userId,
        action: 'auth.password_changed', entityType: 'User', entityId: userId, meta,
      });
    });
    return { changed: true };
  }

  /**
   * إنشاء رمز إعادة تعيين + إشعار داخلي. حتى ربط مزود SMS (المرحلة 9)
   * يُعاد الرمز في بيئة development فقط — في production لا يُكشف (§106: لا تزييف تسليم).
   */
  async forgotPassword(dto: ForgotPasswordDto, meta: RequestMeta) {
    const generic = { message: 'إذا كان الرقم مسجلاً فستصلك تعليمات إعادة التعيين' };
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) return generic;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.sha256(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    if (user.organizationId) {
      await this.prisma.notification.create({
        data: {
          organizationId: user.organizationId,
          recipientUserId: user.id,
          type: 'SYSTEM',
          channel: 'IN_APP',
          title: 'إعادة تعيين كلمة المرور',
          body: 'تم إنشاء طلب إعادة تعيين كلمة المرور لحسابك.',
        },
      });
    }
    await this.audit.log({
      organizationId: user.organizationId, actorUserId: user.id,
      action: 'auth.password_reset_requested', entityType: 'User', entityId: user.id, meta,
    });

    const isDev = this.config.get<string>('NODE_ENV') === 'development';
    return isDev ? { ...generic, devToken: token } : generic;
  }

  async resetPassword(dto: ResetPasswordDto, meta: RequestMeta): Promise<{ reset: boolean }> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.sha256(dto.token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt <= new Date()) {
      throw new AppException(ErrorCodes.INVALID_CREDENTIALS, 'رابط إعادة التعيين غير صالح أو منتهي', 400);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash: await hashPassword(dto.newPassword) },
      });
      await tx.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } });
      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const user = await tx.user.findUniqueOrThrow({ where: { id: stored.userId } });
      await this.audit.log({
        tx, organizationId: user.organizationId, actorUserId: stored.userId,
        action: 'auth.password_reset', entityType: 'User', entityId: stored.userId, meta,
      });
    });
    return { reset: true };
  }
}
