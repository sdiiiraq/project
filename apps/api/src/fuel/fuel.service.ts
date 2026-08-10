import { Injectable } from '@nestjs/common';
import { Decimal, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdjustInventoryDto, AnalyticsQuery, ConsumptionQuery, CreateConsumptionDto, CreatePurchaseDto,
  CreateSupplierDto, FuelConfigDto, InventoryQuery, PurchaseQuery, RejectPurchaseDto, UpdateSupplierDto,
} from './dto';

/**
 * تحويل وحدات الوقود إلى لتر. القيم نصوص/Decimal للحفاظ على الحتمية
 * وتجنب الحساب العائم (§77/§83).
 */
const UNIT_TO_LITERS: Record<string, string> = { LITER: '1', GALLON: '3.78541', BARREL: '158.987' };

/** إعدادات الوقود الافتراضية (افتراضات موثقة §0) */
const DEFAULT_FUEL_CONFIG = {
  expectedLitersPerHour: '20',
  varianceThresholdPercent: 25,
  purchaseApprovalThreshold: '500000',
};

@Injectable()
export class FuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
  ) {}

  private toLiters(quantity: Decimal, unit: string): Decimal {
    return quantity.mul(new Decimal(UNIT_TO_LITERS[unit] ?? '1'));
  }

  // ============ CONFIG ============
  async getFuelConfig(orgId: string) {
    const row = await this.prisma.organizationSetting.findUnique({
      where: { organizationId_key: { organizationId: orgId, key: 'fuel' } },
    });
    const stored = (row?.value ?? {}) as Partial<typeof DEFAULT_FUEL_CONFIG>;
    return { ...DEFAULT_FUEL_CONFIG, ...stored };
  }

  async setFuelConfig(actor: AuthUser, dto: FuelConfigDto, meta: RequestMeta) {
    const current = await this.getFuelConfig(actor.organizationId);
    const next = { ...current, ...dto };
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationSetting.upsert({
        where: { organizationId_key: { organizationId: actor.organizationId, key: 'fuel' } },
        update: { value: next as Prisma.InputJsonValue, updatedBy: actor.userId },
        create: { organizationId: actor.organizationId, key: 'fuel', value: next as Prisma.InputJsonValue, updatedBy: actor.userId },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'settings.update', entityType: 'OrganizationSetting',
        after: { key: 'fuel', value: next }, meta,
      });
    });
    return next;
  }

  // ============ SUPPLIERS ============
  async listSuppliers(actor: AuthUser) {
    return this.prisma.fuelSupplier.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(actor: AuthUser, dto: CreateSupplierDto, meta: RequestMeta) {
    const existing = await this.prisma.fuelSupplier.findFirst({
      where: { organizationId: actor.organizationId, name: dto.name },
    });
    if (existing) throw new AppException(ErrorCodes.DUPLICATE_RESOURCE, 'اسم المورد مستخدم مسبقاً', 409);
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.fuelSupplier.create({
        data: { organizationId: actor.organizationId, name: dto.name, phone: dto.phone, notes: dto.notes },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'fuel.supplier_create', entityType: 'FuelSupplier', entityId: supplier.id,
        after: { name: dto.name }, meta,
      });
      return supplier;
    });
  }

  async updateSupplier(actor: AuthUser, id: string, dto: UpdateSupplierDto, meta: RequestMeta) {
    const supplier = await this.prisma.fuelSupplier.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!supplier) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المورد غير موجود', 404);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.fuelSupplier.update({ where: { id }, data: { ...dto } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'fuel.supplier_update', entityType: 'FuelSupplier', entityId: id,
        before: supplier, after: updated, meta,
      });
      return updated;
    });
  }

  // ============ PURCHASES ============
  async listPurchases(actor: AuthUser, query: PurchaseQuery) {
    if (query.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, query.generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    const where: Prisma.FuelPurchaseWhereInput = {
      organizationId: actor.organizationId,
      ...(allowed && !query.generatorId ? { generatorId: { in: allowed } } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fuelPurchase.findMany({
        where,
        include: { generator: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } } },
        orderBy: { purchaseDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.fuelPurchase.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total } };
  }

  private async loadOwnedPurchase(orgId: string, id: string) {
    const purchase = await this.prisma.fuelPurchase.findFirst({ where: { id, organizationId: orgId } });
    if (!purchase) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الشراء غير موجود', 404);
    return purchase;
  }

  /** إضافة معاملة مخزون داخل معاملة أكبر */
  private async addInventoryTx(
    tx: Prisma.TransactionClient, orgId: string, generatorId: string,
    type: 'PURCHASE_IN' | 'CONSUMPTION_OUT' | 'ADJUSTMENT',
    quantity: string, unit: string, referenceId: string | null, createdBy: string, notes: string | null,
  ) {
    await tx.fuelInventoryTransaction.create({
      data: { organizationId: orgId, generatorId, type, quantity, unit, referenceId, notes, createdBy, recordedAt: new Date() },
    });
  }

  /** إنشاء شراء — الكلفة الكلية تُحسب في الخادم، والموافقة التلقائية دون العتبة (§31) */
  async createPurchase(actor: AuthUser, dto: CreatePurchaseDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    const config = await this.getFuelConfig(actor.organizationId);
    const quantity = new Decimal(dto.quantity);
    const unitCost = new Decimal(dto.unitCost);
    const totalCost = quantity.mul(unitCost);
    const autoApprove = totalCost.lte(new Decimal(config.purchaseApprovalThreshold));

    return this.prisma.$transaction(async (tx) => {
      if (dto.supplierId) {
        const supplier = await tx.fuelSupplier.findFirst({ where: { id: dto.supplierId, organizationId: actor.organizationId } });
        if (!supplier) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المورد غير موجود', 404);
      }
      const purchase = await tx.fuelPurchase.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: dto.generatorId,
          supplierId: dto.supplierId,
          quantity: dto.quantity,
          unit: dto.unit,
          unitCost: dto.unitCost,
          totalCost: totalCost.toFixed(),
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
          invoiceNumber: dto.invoiceNumber,
          attachmentKey: dto.attachmentKey,
          status: autoApprove ? 'APPROVED' : 'PENDING',
          createdBy: actor.userId,
          approvedBy: autoApprove ? actor.userId : null,
          approvedAt: autoApprove ? new Date() : null,
        },
      });
      // المعتمد فقط يدخل المخزون (الموافقة = إضافة PURCHASE_IN)
      if (autoApprove) {
        await this.addInventoryTx(tx, actor.organizationId, dto.generatorId, 'PURCHASE_IN', dto.quantity, dto.unit, purchase.id, actor.userId, dto.invoiceNumber ? `شراء: ${dto.invoiceNumber}` : 'شراء وقود');
      }
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'fuel.purchase_create', entityType: 'FuelPurchase', entityId: purchase.id,
        after: { quantity: dto.quantity, totalCost: totalCost.toFixed(), status: purchase.status },
        metadata: { generatorId: dto.generatorId, autoApprove }, meta,
      });
      return purchase;
    });
  }

  async approvePurchase(actor: AuthUser, id: string, meta: RequestMeta) {
    const purchase = await this.loadOwnedPurchase(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, purchase.generatorId);
    if (purchase.status !== 'PENDING') throw new AppException(ErrorCodes.INVALID_STATE, 'الشراء ليس بانتظار الموافقة', 422);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.fuelPurchase.update({
        where: { id },
        data: { status: 'APPROVED', approvedBy: actor.userId, approvedAt: new Date() },
      });
      await this.addInventoryTx(tx, actor.organizationId, purchase.generatorId, 'PURCHASE_IN', purchase.quantity.toString(), purchase.unit, purchase.id, actor.userId, 'موافقة على شراء وقود');
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'fuel.approval', entityType: 'FuelPurchase', entityId: id,
        metadata: { generatorId: purchase.generatorId }, meta,
      });
      return updated;
    });
  }

  async rejectPurchase(actor: AuthUser, id: string, dto: RejectPurchaseDto, meta: RequestMeta) {
    const purchase = await this.loadOwnedPurchase(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, purchase.generatorId);
    if (purchase.status !== 'PENDING') throw new AppException(ErrorCodes.INVALID_STATE, 'الشراء ليس بانتظار الموافقة', 422);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.fuelPurchase.update({ where: { id }, data: { status: 'REJECTED', rejectedReason: dto.reason } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'fuel.rejection', entityType: 'FuelPurchase', entityId: id,
        metadata: { generatorId: purchase.generatorId, reason: dto.reason }, meta,
      });
      return updated;
    });
  }

  // ============ INVENTORY ============
  /** المخزون = مجموع معاملات الإدخال − السحب ± التسوية، محوّل إلى لتر (§204 المصدر قاعدة البيانات) */
  async getInventory(actor: AuthUser, query: InventoryQuery) {
    if (query.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, query.generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    const where: Prisma.FuelInventoryTransactionWhereInput = {
      organizationId: actor.organizationId,
      ...(query.generatorId ? { generatorId: query.generatorId } : allowed ? { generatorId: { in: allowed } } : {}),
    };
    const grouped = await this.prisma.fuelInventoryTransaction.groupBy({
      by: ['generatorId', 'type', 'unit'],
      where,
      _sum: { quantity: true },
    });
    const netByGen = new Map<string, Decimal>();
    for (const row of grouped) {
      const liters = this.toLiters(row._sum.quantity ?? new Decimal(0), row.unit);
      const signed = row.type === 'CONSUMPTION_OUT' ? liters.neg() : liters;
      const cur = netByGen.get(row.generatorId) ?? new Decimal(0);
      netByGen.set(row.generatorId, cur.add(signed));
    }
    const generatorIds = [...netByGen.keys()];
    const generators = generatorIds.length
      ? await this.prisma.generator.findMany({ where: { id: { in: generatorIds } }, select: { id: true, name: true } })
      : [];
    const genNames = new Map(generators.map((g) => [g.id, g.name]));
    return {
      items: generatorIds.map((gid) => ({
        generatorId: gid,
        generatorName: genNames.get(gid) ?? '—',
        netLiters: (netByGen.get(gid) ?? new Decimal(0)).toDecimalPlaces(2).toFixed(),
      })),
    };
  }

  async adjustInventory(actor: AuthUser, dto: AdjustInventoryDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    return this.prisma.$transaction(async (tx) => {
      const signed = dto.direction === 'DECREASE' ? new Decimal(dto.quantity).neg().toFixed() : dto.quantity;
      await this.addInventoryTx(tx, actor.organizationId, dto.generatorId, 'ADJUSTMENT', signed, dto.unit, null, actor.userId, dto.notes);
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'fuel.inventory_adjust', entityType: 'FuelInventoryTransaction',
        after: { generatorId: dto.generatorId, quantity: signed, unit: dto.unit },
        metadata: { generatorId: dto.generatorId, direction: dto.direction }, meta,
      });
      return { adjusted: true };
    });
  }

  // ============ CONSUMPTION ============
  async listConsumption(actor: AuthUser, query: ConsumptionQuery) {
    if (query.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, query.generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    const where: Prisma.FuelConsumptionRecordWhereInput = {
      organizationId: actor.organizationId,
      ...(allowed && !query.generatorId ? { generatorId: { in: allowed } } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fuelConsumptionRecord.findMany({
        where,
        include: { generator: { select: { id: true, name: true } } },
        orderBy: { recordedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.fuelConsumptionRecord.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total } };
  }

  /** تسجيل استهلاك — ينشئ سجل الاستهلاك + معاملة CONSUMPTION_OUT لخصم المخزون معًا */
  async createConsumption(actor: AuthUser, dto: CreateConsumptionDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.fuelConsumptionRecord.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: dto.generatorId,
          quantity: dto.quantity,
          unit: dto.unit,
          source: (dto.source ?? 'MANUAL') as 'MANUAL' | 'IOT' | 'IMPORTED',
          notes: dto.notes,
          recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
          createdBy: actor.userId,
        },
      });
      await this.addInventoryTx(tx, actor.organizationId, dto.generatorId, 'CONSUMPTION_OUT', dto.quantity, dto.unit, record.id, actor.userId, dto.notes ?? 'استهلاك وقود');
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'fuel.consumption', entityType: 'FuelConsumptionRecord', entityId: record.id,
        after: { quantity: dto.quantity, unit: dto.unit },
        metadata: { generatorId: dto.generatorId }, meta,
      });
      return record;
    });
  }

  // ============ ANALYTICS (§32 عتبات حتمية، ليست AI) ============
  async getAnalytics(actor: AuthUser, query: AnalyticsQuery) {
    if (query.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, query.generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    const generatorIds = query.generatorId ? [query.generatorId] : allowed;
    const config = await this.getFuelConfig(actor.organizationId);

    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = query.to ? new Date(query.to) : now;
    const period = { from: from.toISOString(), to: to.toISOString() };
    const emptyResult = {
      rows: [],
      totals: { runtimeHours: '0', consumedLiters: '0', fuelCost: '0' },
      config: { expectedLitersPerHour: config.expectedLitersPerHour, varianceThresholdPercent: config.varianceThresholdPercent },
      period,
    };
    if (generatorIds && generatorIds.length === 0) return emptyResult;

    const genWhere: Prisma.GeneratorRuntimeWhereInput['generatorId'] = generatorIds ? { in: generatorIds } : undefined;

    const [runtimeGroup, costGroup, consumptionGroup] = await Promise.all([
      this.prisma.generatorRuntime.groupBy({
        by: ['generatorId'],
        where: { organizationId: actor.organizationId, ...(genWhere ? { generatorId: genWhere } : {}), startTime: { gte: from, lte: to }, durationMinutes: { not: null } },
        _sum: { durationMinutes: true },
      }),
      this.prisma.fuelPurchase.groupBy({
        by: ['generatorId'],
        where: { organizationId: actor.organizationId, ...(genWhere ? { generatorId: genWhere } : {}), status: 'APPROVED', purchaseDate: { gte: from, lte: to } },
        _sum: { totalCost: true },
      }),
      this.prisma.fuelInventoryTransaction.groupBy({
        by: ['generatorId', 'unit'],
        where: { organizationId: actor.organizationId, ...(genWhere ? { generatorId: genWhere } : {}), type: 'CONSUMPTION_OUT', recordedAt: { gte: from, lte: to } },
        _sum: { quantity: true },
      }),
    ]);

    const runtimeByGen = new Map(runtimeGroup.map((r) => [r.generatorId, r._sum.durationMinutes ?? 0]));
    const costByGen = new Map(costGroup.map((c) => [c.generatorId, c._sum.totalCost ?? new Decimal(0)]));
    const consumedByGen = new Map<string, Decimal>();
    for (const row of consumptionGroup) {
      const liters = this.toLiters(row._sum.quantity ?? new Decimal(0), row.unit);
      const cur = consumedByGen.get(row.generatorId) ?? new Decimal(0);
      consumedByGen.set(row.generatorId, cur.add(liters));
    }

    const reportGenIds = new Set<string>();
    runtimeByGen.forEach((_, k) => reportGenIds.add(k));
    costByGen.forEach((_, k) => reportGenIds.add(k));
    consumedByGen.forEach((_, k) => reportGenIds.add(k));
    if (reportGenIds.size === 0) return emptyResult;

    const generators = await this.prisma.generator.findMany({ where: { id: { in: [...reportGenIds] } }, select: { id: true, name: true } });
    const genNames = new Map(generators.map((g) => [g.id, g.name]));

    const expectedPerHour = new Decimal(config.expectedLitersPerHour);
    const thresholdPercent = new Decimal(config.varianceThresholdPercent);

    const rows = [];
    let totRuntime = new Decimal(0);
    let totConsumed = new Decimal(0);
    let totCost = new Decimal(0);
    for (const gid of reportGenIds) {
      const runtimeHours = new Decimal(runtimeByGen.get(gid) ?? 0).div(60).toDecimalPlaces(2);
      const consumed = consumedByGen.get(gid) ?? new Decimal(0);
      const cost = costByGen.get(gid) ?? new Decimal(0);
      const expected = runtimeHours.mul(expectedPerHour).toDecimalPlaces(2);
      const variance = consumed.sub(expected).toDecimalPlaces(2);
      const variancePercent = expected.gt(0) ? variance.div(expected).mul(100).toDecimalPlaces(1) : null;
      // الإبلاغ عن الشذوذ بعتبة حتمية — ليس AI (§32)
      const abnormal = variancePercent !== null && variancePercent.gt(thresholdPercent);
      const fuelPerRuntimeHour = runtimeHours.gt(0) ? consumed.div(runtimeHours).toDecimalPlaces(2) : null;
      const costPerRuntimeHour = runtimeHours.gt(0) ? cost.div(runtimeHours).toDecimalPlaces(2) : null;
      rows.push({
        generatorId: gid,
        generatorName: genNames.get(gid) ?? '—',
        runtimeHours: runtimeHours.toFixed(),
        consumedLiters: consumed.toDecimalPlaces(2).toFixed(),
        fuelCost: cost.toFixed(),
        expectedLiters: expected.toFixed(),
        varianceLiters: variance.toFixed(),
        variancePercent: variancePercent?.toFixed() ?? null,
        fuelPerRuntimeHour: fuelPerRuntimeHour?.toFixed() ?? null,
        costPerRuntimeHour: costPerRuntimeHour?.toFixed() ?? null,
        abnormal,
      });
      totRuntime = totRuntime.add(runtimeHours);
      totConsumed = totConsumed.add(consumed);
      totCost = totCost.add(cost);
    }

    return {
      rows,
      totals: { runtimeHours: totRuntime.toFixed(), consumedLiters: totConsumed.toDecimalPlaces(2).toFixed(), fuelCost: totCost.toFixed() },
      config: { expectedLitersPerHour: config.expectedLitersPerHour, varianceThresholdPercent: config.varianceThresholdPercent },
      period,
    };
  }
}
