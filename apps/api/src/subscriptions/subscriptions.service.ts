import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CancelSubscriptionDto, CreateSubscriptionDto, ListSubscriptionsQuery, UpdateSubscriptionDto } from './dto';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
  ) {}

  async list(orgId: string, user: AuthUser, query: ListSubscriptionsQuery) {
    if (query.generatorId) {
      await this.scope.assertGeneratorAccess(orgId, user, query.generatorId);
    }
    const allowed = await this.scope.accessibleGeneratorIds(orgId, user);

    const where: Prisma.SubscriptionWhereInput = {
      organizationId: orgId,
      ...(allowed ? { generatorId: { in: allowed } } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where,
        include: {
          customer: { select: { id: true, fullName: true, customerNumber: true } },
          amperePlan: { select: { id: true, name: true, ampereAmount: true, price: true } },
          generator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total } };
  }

  private async loadOwned(orgId: string, id: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id, organizationId: orgId },
      include: { customer: { select: { id: true, fullName: true, generatorId: true } } },
    });
    if (!subscription) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الاشتراك غير موجود', 404);
    return subscription;
  }

  async get(orgId: string, user: AuthUser, id: string) {
    const subscription = await this.loadOwned(orgId, id);
    await this.scope.assertGeneratorAccess(orgId, user, subscription.generatorId);
    return subscription;
  }

  async create(actor: AuthUser, dto: CreateSubscriptionDto, meta: RequestMeta) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!customer) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المشترك غير موجود', 404);
    // المؤرشف/الموقوف لا يستقبل اشتراكًا جديدًا قبل إعادة التنشيط (§112)
    if (customer.status !== 'ACTIVE') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'لا يمكن إنشاء اشتراك لمشترك غير نشط أو مؤرشف', 422);
    }
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, customer.generatorId);

    const plan = await this.prisma.amperePlan.findFirst({
      where: { id: dto.amperePlanId, organizationId: actor.organizationId, status: 'ACTIVE' },
    });
    if (!plan) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'خطة الأمبير غير موجودة أو غير نشطة', 404);
    if (plan.generatorId !== customer.generatorId) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'الخطة لا تتبع مولدة المشترك', 422);
    }
    const now = new Date();
    if (plan.effectiveTo && plan.effectiveTo < now) {
      throw new AppException(ErrorCodes.INVALID_STATE, 'صلاحية الخطة منتهية', 422);
    }

    // لا اشتراكين نشطين لنفس المشترك (§112)
    const existingActive = await this.prisma.subscription.findFirst({
      where: { customerId: customer.id, status: { in: ['ACTIVE', 'PENDING'] } },
    });
    if (existingActive) {
      throw new AppException(ErrorCodes.INVALID_STATE, 'المشترك لديه اشتراك نشط بالفعل', 422);
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : now;
    const status = startDate.getTime() <= Date.now() ? 'ACTIVE' : 'PENDING';

    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          organizationId: actor.organizationId,
          customerId: customer.id,
          generatorId: customer.generatorId,
          amperePlanId: plan.id,
          startDate,
          status,
          billingCycle: (dto.billingCycle as 'MONTHLY' | undefined) ?? 'MONTHLY',
          customPrice: dto.customPrice,
          customAmpere: dto.customAmpere,
          discountType: dto.discountType as 'FIXED' | 'PERCENTAGE' | undefined,
          discountValue: dto.discountValue,
          billingDay: dto.billingDay,
          notes: dto.notes,
        },
        include: {
          customer: { select: { id: true, fullName: true, customerNumber: true } },
          amperePlan: { select: { id: true, name: true, ampereAmount: true, price: true } },
          generator: { select: { id: true, name: true } },
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'subscription.create', entityType: 'Subscription', entityId: subscription.id,
        after: { customerId: customer.id, planId: plan.id, customPrice: dto.customPrice ?? null, status },
        metadata: { generatorId: customer.generatorId, customerId: customer.id }, meta,
      });
      return subscription;
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateSubscriptionDto, meta: RequestMeta) {
    const subscription = await this.loadOwned(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, subscription.generatorId);
    if (subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'لا يمكن تعديل اشتراك ملغي أو منتهي', 422);
    }

    if (dto.amperePlanId && dto.amperePlanId !== subscription.amperePlanId) {
      const plan = await this.prisma.amperePlan.findFirst({
        where: { id: dto.amperePlanId, organizationId: actor.organizationId, status: 'ACTIVE' },
      });
      if (!plan) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الخطة الجديدة غير موجودة', 404);
      if (plan.generatorId !== subscription.generatorId) {
        throw new AppException(ErrorCodes.VALIDATION_ERROR, 'الخطة الجديدة لا تتبع نفس المولدة', 422);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({ where: { id }, data: { ...dto } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'subscription.update', entityType: 'Subscription', entityId: id,
        before: subscription, after: updated,
        metadata: { generatorId: subscription.generatorId, customerId: subscription.customerId }, meta,
      });
      return updated;
    });
  }

  private async transition(
    actor: AuthUser,
    id: string,
    from: string[],
    to: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED',
    action: string,
    meta: RequestMeta,
    extra?: { reason?: string; effectiveDate?: Date },
  ) {
    const subscription = await this.loadOwned(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, subscription.generatorId);
    if (!from.includes(subscription.status)) {
      throw new AppException(ErrorCodes.INVALID_STATE, `لا يمكن تنفيذ العملية والحالة الحالية: ${subscription.status}`, 422);
    }

    if (to === 'ACTIVE') {
      const other = await this.prisma.subscription.findFirst({
        where: { customerId: subscription.customerId, status: 'ACTIVE', NOT: { id } },
      });
      if (other) throw new AppException(ErrorCodes.INVALID_STATE, 'المشترك لديه اشتراك نشط آخر', 422);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id },
        data: {
          status: to,
          ...(to === 'CANCELLED'
            ? { cancelledAt: extra?.effectiveDate ?? new Date(), cancellationReason: extra?.reason, endDate: extra?.effectiveDate ?? new Date() }
            : {}),
          ...(to === 'ACTIVE' ? { cancelledAt: null, cancellationReason: null, endDate: null } : {}),
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action, entityType: 'Subscription', entityId: id,
        before: { status: subscription.status }, after: { status: to },
        metadata: { generatorId: subscription.generatorId, customerId: subscription.customerId, reason: extra?.reason ?? null },
        meta,
      });
      return updated;
    });
  }

  suspend(actor: AuthUser, id: string, meta: RequestMeta) {
    return this.transition(actor, id, ['ACTIVE'], 'SUSPENDED', 'subscription.suspend', meta);
  }

  cancel(actor: AuthUser, id: string, dto: CancelSubscriptionDto, meta: RequestMeta) {
    // الإلغاء يتطلب سببًا وتاريخًا نافذًا (§112)
    return this.transition(actor, id, ['ACTIVE', 'SUSPENDED', 'PENDING'], 'CANCELLED', 'subscription.cancel', meta, {
      reason: dto.reason,
      effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined,
    });
  }

  reactivate(actor: AuthUser, id: string, meta: RequestMeta) {
    return this.transition(actor, id, ['SUSPENDED', 'CANCELLED'], 'ACTIVE', 'subscription.reactivate', meta);
  }

  async history(orgId: string, user: AuthUser, id: string) {
    await this.get(orgId, user, id);
    return this.prisma.auditLog.findMany({
      where: { organizationId: orgId, entityType: 'Subscription', entityId: id },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
