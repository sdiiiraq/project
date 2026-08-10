import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from './errors';
import type { AuthUser } from './types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * نطاق الوصول للمولدات (§10):
 * - ORGANIZATION_OWNER يرى كل مولدات منظمته.
 * - بقية الأدوار يرون فقط المولدات المرتبطة بهم عبر GeneratorUserScope.
 * الفرض في الـ backend دائمًا (§10).
 */
@Injectable()
export class GeneratorScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** null = بلا قيد (يرى كل مولدات المنظمة)، وإلا قائمة معرفات المولدات المسموحة */
  async accessibleGeneratorIds(organizationId: string, user: AuthUser): Promise<string[] | null> {
    if (user.roles.includes('ORGANIZATION_OWNER')) return null;
    const scopes = await this.prisma.generatorUserScope.findMany({
      where: { userId: user.userId, generator: { organizationId, deletedAt: null } },
      select: { generatorId: true },
    });
    return scopes.map((s) => s.generatorId);
  }

  async assertGeneratorAccess(organizationId: string, user: AuthUser, generatorId: string): Promise<void> {
    const generator = await this.prisma.generator.findFirst({
      where: { id: generatorId, organizationId, deletedAt: null },
    });
    if (!generator) {
      // 404 بدل 403 حتى لا نكشف وجود موارد خارج نطاق المستخدم
      throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المولدة غير موجودة', 404);
    }
    if (user.roles.includes('ORGANIZATION_OWNER')) return;
    const scope = await this.prisma.generatorUserScope.findUnique({
      where: { userId_generatorId: { userId: user.userId, generatorId } },
    });
    if (!scope) {
      throw new AppException(ErrorCodes.FORBIDDEN, 'لا تملك صلاحية الوصول إلى هذه المولدة', 403);
    }
  }
}
