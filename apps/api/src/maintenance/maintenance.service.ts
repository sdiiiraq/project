import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { AddPartDto, CompleteMaintenanceDto, CreateMaintenanceDto, CreateSparePartDto, MaintenanceQuery, UpdateMaintenanceDto } from './dto';

/** الافتراضي: الصيانة التالية بعد 90 يومًا إن لم تُحدد صراحةً (افتراض موثق §0) */
const DEFAULT_NEXT_MAINTENANCE_DAYS = 90;

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
  ) {}

  async list(actor: AuthUser, query: MaintenanceQuery) {
    if (query.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, query.generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    const where: Prisma.MaintenanceRecordWhereInput = {
      organizationId: actor.organizationId,
      ...(allowed && !query.generatorId ? { generatorId: { in: allowed } } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.maintenanceRecord.findMany({
        where,
        include: {
          generator: { select: { id: true, name: true } },
          technician: { select: { id: true, name: true } },
          parts: { include: { sparePart: { select: { id: true, name: true } } } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.maintenanceRecord.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total } };
  }

  private async loadOwned(orgId: string, id: string) {
    const record = await this.prisma.maintenanceRecord.findFirst({
      where: { id, organizationId: orgId },
      include: {
        generator: { select: { id: true, name: true } },
        technician: { select: { id: true, name: true } },
        parts: { include: { sparePart: { select: { id: true, name: true } } } },
      },
    });
    if (!record) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'سجل الصيانة غير موجود', 404);
    return record;
  }

  async get(actor: AuthUser, id: string) {
    const record = await this.loadOwned(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, record.generatorId);
    return record;
  }

  async create(actor: AuthUser, dto: CreateMaintenanceDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.maintenanceRecord.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: dto.generatorId,
          type: dto.type,
          date: dto.date ? new Date(dto.date) : new Date(),
          description: dto.description,
          technicianId: dto.technicianId,
          cost: dto.cost,
          nextMaintenanceDate: dto.nextMaintenanceDate ? new Date(dto.nextMaintenanceDate) : null,
          runtimeAtMaintenance: dto.runtimeAtMaintenance,
          status: 'PLANNED',
          createdBy: actor.userId,
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'maintenance.create', entityType: 'MaintenanceRecord', entityId: record.id,
        after: { type: dto.type }, metadata: { generatorId: dto.generatorId }, meta,
      });
      return record;
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateMaintenanceDto, meta: RequestMeta) {
    const record = await this.loadOwned(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, record.generatorId);
    if (record.status === 'COMPLETED' || record.status === 'CANCELLED') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'لا يمكن تعديل سجل صيانة مكتمل أو ملغي', 422);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceRecord.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.date ? { date: new Date(dto.date) } : {}),
          ...(dto.nextMaintenanceDate ? { nextMaintenanceDate: new Date(dto.nextMaintenanceDate) } : {}),
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'maintenance.update', entityType: 'MaintenanceRecord', entityId: id,
        metadata: { generatorId: record.generatorId }, meta,
      });
      return updated;
    });
  }

  async start(actor: AuthUser, id: string, meta: RequestMeta) {
    const record = await this.loadOwned(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, record.generatorId);
    if (record.status !== 'PLANNED') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'البدء يتطلب سجلًا مخططًا', 422);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceRecord.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'maintenance.start', entityType: 'MaintenanceRecord', entityId: id,
        metadata: { generatorId: record.generatorId }, meta,
      });
      return updated;
    });
  }

  /** الإكمال (§146): يحسب موعد الصيانة التالية إن لم يُحدد صراحةً */
  async complete(actor: AuthUser, id: string, dto: CompleteMaintenanceDto, meta: RequestMeta) {
    const record = await this.loadOwned(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, record.generatorId);
    if (record.status === 'COMPLETED') throw new AppException(ErrorCodes.INVALID_STATE, 'السجل مكتمل بالفعل', 422);
    if (record.status === 'CANCELLED') throw new AppException(ErrorCodes.INVALID_STATE, 'السجل ملغي', 422);

    const nextDate = dto.nextMaintenanceDate
      ? new Date(dto.nextMaintenanceDate)
      : new Date(Date.now() + DEFAULT_NEXT_MAINTENANCE_DAYS * 86400000);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceRecord.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          cost: dto.cost ?? record.cost,
          runtimeAtMaintenance: dto.runtimeAtMaintenance ?? record.runtimeAtMaintenance,
          nextMaintenanceDate: nextDate,
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'maintenance.complete', entityType: 'MaintenanceRecord', entityId: id,
        after: { nextMaintenanceDate: nextDate.toISOString() },
        metadata: { generatorId: record.generatorId }, meta,
      });
      return updated;
    });
  }

  async cancel(actor: AuthUser, id: string, meta: RequestMeta) {
    const record = await this.loadOwned(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, record.generatorId);
    if (record.status === 'COMPLETED') throw new AppException(ErrorCodes.INVALID_STATE, 'لا يمكن إلغاء سجل مكتمل', 422);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceRecord.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'maintenance.cancel', entityType: 'MaintenanceRecord', entityId: id,
        metadata: { generatorId: record.generatorId }, meta,
      });
      return updated;
    });
  }

  // ============ SPARE PARTS ============
  async listSpareParts(actor: AuthUser) {
    return this.prisma.sparePart.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createSparePart(actor: AuthUser, dto: CreateSparePartDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const part = await tx.sparePart.create({
        data: { organizationId: actor.organizationId, name: dto.name, quantity: dto.quantity, unitCost: dto.unitCost },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'maintenance.part_create', entityType: 'SparePart', entityId: part.id,
        after: { name: dto.name, quantity: dto.quantity }, meta,
      });
      return part;
    });
  }

  /** إضافة قطعة لسجل صيانة — خصم من المخزون معاملاتيًا مع قفل صفّي (§89) */
  async addPart(actor: AuthUser, maintenanceId: string, dto: AddPartDto, meta: RequestMeta) {
    const record = await this.loadOwned(actor.organizationId, maintenanceId);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, record.generatorId);
    if (record.status === 'COMPLETED' || record.status === 'CANCELLED') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'لا يمكن إضافة قطع لسجل مكتمل أو ملغي', 422);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM spare_parts WHERE id = ${dto.sparePartId} FOR UPDATE`);
      const part = await tx.sparePart.findFirst({ where: { id: dto.sparePartId, organizationId: actor.organizationId } });
      if (!part) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'قطعة الغيار غير موجودة', 404);
      if (part.quantity < dto.quantity) {
        throw new AppException(ErrorCodes.INVALID_STATE, `الكمية غير كافية في المخزون (المتاح ${part.quantity})`, 422);
      }
      const existing = await tx.maintenanceSparePart.findUnique({
        where: { maintenanceId_sparePartId: { maintenanceId, sparePartId: dto.sparePartId } },
      });
      if (existing) throw new AppException(ErrorCodes.DUPLICATE_RESOURCE, 'القطعة مضافة بالفعل لهذا السجل', 409);

      const usage = await tx.maintenanceSparePart.create({
        data: {
          organizationId: actor.organizationId,
          maintenanceId,
          sparePartId: dto.sparePartId,
          quantity: dto.quantity,
          unitCost: part.unitCost,
        },
      });
      await tx.sparePart.update({ where: { id: dto.sparePartId }, data: { quantity: { decrement: dto.quantity } } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'maintenance.part_add', entityType: 'MaintenanceSparePart', entityId: usage.id,
        after: { sparePartId: dto.sparePartId, quantity: dto.quantity },
        metadata: { maintenanceId, generatorId: record.generatorId }, meta,
      });
      return usage;
    });
  }

  /** إزالة قطعة من سجل صيانة — إرجاع الكمية للمخزون (لا حذف صامت §211-9) */
  async removePart(actor: AuthUser, maintenanceId: string, sparePartId: string, meta: RequestMeta) {
    const record = await this.loadOwned(actor.organizationId, maintenanceId);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, record.generatorId);
    if (record.status === 'COMPLETED') throw new AppException(ErrorCodes.INVALID_STATE, 'لا يمكن تعديل قطع سجل مكتمل', 422);

    return this.prisma.$transaction(async (tx) => {
      const usage = await tx.maintenanceSparePart.findUnique({
        where: { maintenanceId_sparePartId: { maintenanceId, sparePartId } },
      });
      if (!usage) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'القطعة غير مضافة لهذا السجل', 404);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM spare_parts WHERE id = ${sparePartId} FOR UPDATE`);
      await tx.maintenanceSparePart.delete({ where: { id: usage.id } });
      await tx.sparePart.update({ where: { id: sparePartId }, data: { quantity: { increment: usage.quantity } } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'maintenance.part_remove', entityType: 'MaintenanceSparePart', entityId: usage.id,
        after: { sparePartId, quantityReturned: usage.quantity },
        metadata: { maintenanceId, generatorId: record.generatorId }, meta,
      });
      return { removed: true, quantityReturned: usage.quantity };
    });
  }
}
