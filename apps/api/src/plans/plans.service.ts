import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto, RevisePlanDto } from './dto';

/**
 * تاريخية الأسعار (§15): تعديل السعر ينشئ نسخة جديدة من الخطة
 * وينهي السابقة بتاريخ سريان — الفواتير التاريخية لا تتغير أبدًا.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
  ) {}

  async list(orgId: string, user: AuthUser, generatorId: string, includeInactive: boolean) {
    await this.scope.assertGeneratorAccess(orgId, user, generatorId);
    return this.prisma.amperePlan.findMany({
      where: {
        organizationId: orgId,
        generatorId,
        ...(includeInactive ? {} : { status: 'ACTIVE', effectiveTo: null }),
      },
      include: { _count: { select: { subscriptions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(orgId: string, user: AuthUser, id: string) {
    const plan = await this.prisma.amperePlan.findFirst({ where: { id, organizationId: orgId } });
    if (!plan) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الخطة غير موجودة', 404);
    await this.scope.assertGeneratorAccess(orgId, user, plan.generatorId);
    return plan;
  }

  async create(actor: AuthUser, dto: CreatePlanDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.amperePlan.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: dto.generatorId,
          name: dto.name,
          ampereAmount: dto.ampereAmount,
          price: dto.price,
          billingCycle: (dto.billingCycle as 'MONTHLY' | undefined) ?? 'MONTHLY',
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
          description: dto.description,
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'plan.create', entityType: 'AmperePlan', entityId: plan.id,
        after: { name: plan.name, price: plan.price.toString(), effectiveFrom: plan.effectiveFrom },
        metadata: { generatorId: dto.generatorId }, meta,
      });
      return plan;
    });
  }

  /** سير عمل تغيير الأسعار (§140): نسخة جديدة + إنهاء السابقة + تدقيق */
  async revise(actor: AuthUser, id: string, dto: RevisePlanDto, meta: RequestMeta) {
    const plan = await this.prisma.amperePlan.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!plan) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الخطة غير موجودة', 404);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, plan.generatorId);

    if (plan.status !== 'ACTIVE' || plan.effectiveTo) {
      throw new AppException(ErrorCodes.INVALID_STATE, 'لا يمكن تعديل خطة غير نشطة', 422);
    }
    const effectiveFrom = new Date(dto.effectiveFrom);
    if (effectiveFrom.getTime() <= plan.effectiveFrom.getTime()) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'تاريخ السريان يجب أن يكون بعد تاريخ بدء الخطة الحالية', 422);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.amperePlan.update({
        where: { id },
        data: { effectiveTo: effectiveFrom, status: 'INACTIVE' },
      });
      const newPlan = await tx.amperePlan.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: plan.generatorId,
          name: plan.name,
          ampereAmount: plan.ampereAmount,
          price: dto.price,
          currency: plan.currency,
          billingCycle: plan.billingCycle,
          effectiveFrom,
          description: dto.description ?? plan.description,
          status: 'ACTIVE',
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'plan.revise', entityType: 'AmperePlan', entityId: newPlan.id,
        before: { planId: plan.id, price: plan.price.toString() },
        after: { planId: newPlan.id, price: dto.price, effectiveFrom: effectiveFrom.toISOString() },
        metadata: { generatorId: plan.generatorId, supersededPlanId: plan.id }, meta,
      });
      return newPlan;
    });
  }
}
