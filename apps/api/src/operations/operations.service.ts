import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangeOperatingStatusDto, CreateActivityDto, CreateOilChangeDto, EndOutageDto,
  OutageQuery, RuntimeQuery, StartOutageDto, StartRuntimeDto, StopRuntimeDto,
} from './dto';

type OperatingStatus = 'ON' | 'OFF' | 'MAINTENANCE' | 'FAULT' | 'UNKNOWN';

function durationMinutes(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
  ) {}

  /**
   * تغيير حالة التشغيل مع تسجيل الانتقال (§108). idempotent إذا لم تتغير الحالة.
   * يُستدعى داخل معاملة أكبر (قفل صف المولدة يزامن التغييرات المتزامنة §89).
   */
  private async setOperatingStatus(
    tx: Prisma.TransactionClient,
    organizationId: string,
    generatorId: string,
    to: OperatingStatus,
    changedBy: string,
    reason?: string,
  ) {
    const generator = await tx.generator.findUnique({ where: { id: generatorId } });
    if (!generator) return;
    const from = generator.operatingStatus;
    if (from === to) return;
    await tx.generator.update({ where: { id: generatorId }, data: { operatingStatus: to } });
    await tx.generatorStatusTransition.create({
      data: { organizationId, generatorId, fromStatus: from, toStatus: to, changedBy, reason },
    });
  }

  // ============ RUNTIME ============
  async listRuntime(actor: AuthUser, query: RuntimeQuery) {
    if (query.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, query.generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    const where: Prisma.GeneratorRuntimeWhereInput = {
      organizationId: actor.organizationId,
      ...(allowed && !query.generatorId ? { generatorId: { in: allowed } } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.generatorRuntime.findMany({
        where,
        include: { generator: { select: { id: true, name: true } } },
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.generatorRuntime.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total } };
  }

  /** بدء جلسة تشغيل — جلسة واحدة مفتوحة لكل مولدة (§89: قفل صف المولدة يمنع السباق) */
  async startRuntime(actor: AuthUser, dto: StartRuntimeDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM generators WHERE id = ${dto.generatorId} FOR UPDATE`);
      const open = await tx.generatorRuntime.findFirst({ where: { generatorId: dto.generatorId, endTime: null } });
      if (open) throw new AppException(ErrorCodes.INVALID_STATE, 'توجد جلسة تشغيل مفتوحة بالفعل لهذه المولدة', 422);
      const runtime = await tx.generatorRuntime.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: dto.generatorId,
          startTime: dto.startTime ? new Date(dto.startTime) : new Date(),
          source: (dto.source ?? 'MANUAL') as 'MANUAL' | 'IOT' | 'IMPORTED',
          notes: dto.notes,
          createdBy: actor.userId,
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'operations.runtime_start', entityType: 'GeneratorRuntime', entityId: runtime.id,
        metadata: { generatorId: dto.generatorId }, meta,
      });
      return runtime;
    });
  }

  async stopRuntime(actor: AuthUser, id: string, dto: StopRuntimeDto, meta: RequestMeta) {
    const runtime = await this.prisma.generatorRuntime.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!runtime) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'جلسة التشغيل غير موجودة', 404);
    if (runtime.endTime) throw new AppException(ErrorCodes.INVALID_STATE, 'جلسة التشغيل مغلقة بالفعل', 422);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, runtime.generatorId);

    const endTime = dto.endTime ? new Date(dto.endTime) : new Date();
    if (endTime.getTime() <= runtime.startTime.getTime()) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'وقت النهاية يجب أن يكون بعد البداية', 422);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.generatorRuntime.update({
        where: { id },
        data: { endTime, durationMinutes: durationMinutes(runtime.startTime, endTime) },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'operations.runtime_stop', entityType: 'GeneratorRuntime', entityId: id,
        after: { durationMinutes: updated.durationMinutes },
        metadata: { generatorId: runtime.generatorId }, meta,
      });
      return updated;
    });
  }

  // ============ OUTAGES ============
  async listOutages(actor: AuthUser, query: OutageQuery) {
    if (query.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, query.generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    const where: Prisma.GeneratorOutageWhereInput = {
      organizationId: actor.organizationId,
      ...(allowed && !query.generatorId ? { generatorId: { in: allowed } } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.generatorOutage.findMany({
        where,
        include: { generator: { select: { id: true, name: true } } },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.generatorOutage.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total } };
  }

  /** بدء انقطاع — انقطاع واحد مفتوح لكل مولدة، مع انتقال حالة التشغيل (§108) */
  async startOutage(actor: AuthUser, dto: StartOutageDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM generators WHERE id = ${dto.generatorId} FOR UPDATE`);
      const open = await tx.generatorOutage.findFirst({ where: { generatorId: dto.generatorId, endedAt: null } });
      if (open) throw new AppException(ErrorCodes.INVALID_STATE, 'يوجد انقطاع مفتوح بالفعل لهذه المولدة', 422);

      const outage = await tx.generatorOutage.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: dto.generatorId,
          startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date(),
          type: dto.type as 'PLANNED' | 'UNPLANNED',
          reason: dto.reason,
          description: dto.description,
          createdBy: actor.userId,
        },
      });
      // الانقطاع غير المخطط = عطل، المخطط = توقف (§108)
      await this.setOperatingStatus(tx, actor.organizationId, dto.generatorId, dto.type === 'UNPLANNED' ? 'FAULT' : 'OFF', actor.userId, dto.reason);
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'operations.outage_start', entityType: 'GeneratorOutage', entityId: outage.id,
        metadata: { generatorId: dto.generatorId, type: dto.type }, meta,
      });
      return outage;
    });
  }

  async endOutage(actor: AuthUser, id: string, dto: EndOutageDto, meta: RequestMeta) {
    const outage = await this.prisma.generatorOutage.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!outage) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الانقطاع غير موجود', 404);
    if (outage.endedAt) throw new AppException(ErrorCodes.INVALID_STATE, 'الانقطاع مغلق بالفعل', 422);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, outage.generatorId);

    const endedAt = dto.endedAt ? new Date(dto.endedAt) : new Date();
    if (endedAt.getTime() <= outage.startedAt.getTime()) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'وقت النهاية يجب أن يكون بعد البداية', 422);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM generators WHERE id = ${outage.generatorId} FOR UPDATE`);
      const updated = await tx.generatorOutage.update({
        where: { id },
        data: { endedAt, durationMinutes: durationMinutes(outage.startedAt, endedAt) },
      });
      await this.setOperatingStatus(tx, actor.organizationId, outage.generatorId, 'ON', actor.userId, 'إنهاء انقطاع');
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'operations.outage_end', entityType: 'GeneratorOutage', entityId: id,
        after: { durationMinutes: updated.durationMinutes },
        metadata: { generatorId: outage.generatorId }, meta,
      });
      return updated;
    });
  }

  // ============ OPERATING STATUS ============
  async changeOperatingStatus(actor: AuthUser, dto: ChangeOperatingStatusDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM generators WHERE id = ${dto.generatorId} FOR UPDATE`);
      await this.setOperatingStatus(tx, actor.organizationId, dto.generatorId, dto.status as OperatingStatus, actor.userId, dto.reason);
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'operations.status_change', entityType: 'Generator', entityId: dto.generatorId,
        after: { operatingStatus: dto.status },
        metadata: { generatorId: dto.generatorId, reason: dto.reason }, meta,
      });
      return tx.generator.findUnique({ where: { id: dto.generatorId } });
    });
  }

  // ============ TECHNICIAN ACTIVITIES ============
  async listActivities(actor: AuthUser, generatorId?: string) {
    if (generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    return this.prisma.technicianActivity.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(generatorId ? { generatorId } : allowed ? { generatorId: { in: allowed } } : {}),
      },
      orderBy: { performedAt: 'desc' },
      take: 100,
    });
  }

  async createActivity(actor: AuthUser, dto: CreateActivityDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.technicianActivity.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: dto.generatorId,
          technicianId: dto.technicianId,
          activityType: dto.activityType,
          description: dto.description,
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'operations.activity', entityType: 'TechnicianActivity', entityId: activity.id,
        metadata: { generatorId: dto.generatorId }, meta,
      });
      return activity;
    });
  }

  // ============ OIL CHANGES ============
  async listOilChanges(actor: AuthUser, generatorId?: string) {
    if (generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    return this.prisma.oilChange.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(generatorId ? { generatorId } : allowed ? { generatorId: { in: allowed } } : {}),
      },
      orderBy: { date: 'desc' },
      take: 100,
    });
  }

  async createOilChange(actor: AuthUser, dto: CreateOilChangeDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    return this.prisma.$transaction(async (tx) => {
      const oilChange = await tx.oilChange.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: dto.generatorId,
          date: dto.date ? new Date(dto.date) : new Date(),
          runtimeHours: dto.runtimeHours,
          notes: dto.notes,
          createdBy: actor.userId,
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'operations.oil_change', entityType: 'OilChange', entityId: oilChange.id,
        metadata: { generatorId: dto.generatorId }, meta,
      });
      return oilChange;
    });
  }
}
