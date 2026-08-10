import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { hashPassword } from '../common/security';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserStatusDto } from './dto';

/** أدوار لا تُعيَّن عبر هذه الواجهة — SUPER_ADMIN منصة فقط، OWNER يُنشأ بالتسجيل، CUSTOMER مستقبلي (§199) */
const NON_ASSIGNABLE = new Set(['SUPER_ADMIN', 'CUSTOMER', 'ORGANIZATION_OWNER']);

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** قائمة المستخدمين — تُستبعد passwordHash صراحةً (§211-33: لا تسريب لتجزئات كلمات المرور) */
  async list(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
        generatorScopes: { select: { generatorId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(actor: AuthUser, dto: CreateUserDto, meta: RequestMeta) {
    const role = await this.prisma.role.findUnique({ where: { name: dto.roleName } });
    if (!role || NON_ASSIGNABLE.has(role.name)) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'الدور غير مسموح للتعيين', 422);
    }
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new AppException(ErrorCodes.DUPLICATE_RESOURCE, 'رقم الهاتف مسجّل مسبقاً', 409);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          name: dto.name,
          phone: dto.phone,
          passwordHash: await hashPassword(dto.password),
          status: 'ACTIVE',
        },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id, organizationId: actor.organizationId } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'user.create', entityType: 'User', entityId: user.id,
        after: { name: dto.name, phone: dto.phone, role: role.name }, meta,
      });
      const { passwordHash: _ph, ...safe } = user;
      return { ...safe, roleName: role.name };
    });
  }

  async updateStatus(actor: AuthUser, userId: string, dto: UpdateUserStatusDto, meta: RequestMeta) {
    if (userId === actor.userId) {
      throw new AppException(ErrorCodes.INVALID_STATE, 'لا يمكنك تعطيل حسابك بنفسك', 422);
    }
    const target = await this.prisma.user.findFirst({ where: { id: userId, organizationId: actor.organizationId } });
    if (!target) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المستخدم غير موجود', 404);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { status: dto.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED' },
      });
      // تعطيل المستخدم يُبطل كل جلساته فورًا (§159: disable user access)
      if (dto.status === 'DISABLED') {
        await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: dto.status === 'DISABLED' ? 'user.disable' : 'user.enable',
        entityType: 'User', entityId: userId,
        before: { status: target.status }, after: { status: updated.status }, meta,
      });
      const { passwordHash: _ph, ...safe } = updated;
      return safe;
    });
  }

  async listRoles() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }
}
