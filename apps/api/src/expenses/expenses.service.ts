import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, CreateExpenseDto, ExpenseQuery, RejectExpenseDto, UpdateExpenseDto } from './dto';

const EXPENSE_INCLUDE = {
  category: { select: { id: true, name: true, nameAr: true } },
  generator: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  approver: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
  ) {}

  // ============ CATEGORIES ============
  async listCategories(organizationId: string) {
    return this.prisma.expenseCategory.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(actor: AuthUser, dto: CreateCategoryDto, meta: RequestMeta) {
    const existing = await this.prisma.expenseCategory.findUnique({
      where: { organizationId_name: { organizationId: actor.organizationId, name: dto.name } },
    });
    if (existing) throw new AppException(ErrorCodes.DUPLICATE_RESOURCE, 'اسم الفئة مستخدم مسبقاً', 409);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.create({
        data: { organizationId: actor.organizationId, name: dto.name, nameAr: dto.nameAr },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'expense.category_create', entityType: 'ExpenseCategory', entityId: category.id, meta,
      });
      return category;
    });
  }

  // ============ EXPENSES ============
  async list(actor: AuthUser, query: ExpenseQuery) {
    if (query.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, query.generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    const where: Prisma.ExpenseWhereInput = {
      organizationId: actor.organizationId,
      ...(allowed && !query.generatorId ? { generatorId: { in: allowed } } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}),
      ...(query.from || query.to
        ? {
            expenseDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        orderBy: { expenseDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total } };
  }

  private async loadOwned(organizationId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, organizationId }, include: EXPENSE_INCLUDE });
    if (!expense) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المصروف غير موجود', 404);
    return expense;
  }

  async get(actor: AuthUser, id: string) {
    const expense = await this.loadOwned(actor.organizationId, id);
    if (expense.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, expense.generatorId);
    return expense;
  }

  async create(actor: AuthUser, dto: CreateExpenseDto, meta: RequestMeta) {
    if (dto.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id: dto.categoryId, organizationId: actor.organizationId },
    });
    if (!category) throw new AppException(ErrorCodes.VALIDATION_ERROR, 'فئة المصروف غير موجودة', 422);

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: dto.generatorId,
          categoryId: dto.categoryId,
          amount: dto.amount,
          currency: dto.currency ?? 'IQD',
          expenseDate: new Date(dto.expenseDate),
          description: dto.description,
          supplierId: dto.supplierId,
          paymentMethod: (dto.paymentMethod ?? 'CASH') as 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'ONLINE' | 'OTHER',
          referenceNumber: dto.referenceNumber,
          attachmentKey: dto.attachmentKey,
          createdBy: actor.userId,
        },
        include: EXPENSE_INCLUDE,
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'expense.create', entityType: 'Expense', entityId: expense.id,
        metadata: { generatorId: dto.generatorId }, meta,
      });
      return expense;
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateExpenseDto, meta: RequestMeta) {
    const expense = await this.loadOwned(actor.organizationId, id);
    if (expense.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, expense.generatorId);
    if (expense.status !== 'PENDING') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'لا يمكن تعديل مصروف تمت مراجعته', 422);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          amount: dto.amount,
          expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
          description: dto.description,
          supplierId: dto.supplierId,
          paymentMethod: dto.paymentMethod as 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'ONLINE' | 'OTHER' | undefined,
          referenceNumber: dto.referenceNumber,
        },
        include: EXPENSE_INCLUDE,
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'expense.update', entityType: 'Expense', entityId: id, meta,
      });
      return updated;
    });
  }

  async approve(actor: AuthUser, id: string, meta: RequestMeta) {
    const expense = await this.loadOwned(actor.organizationId, id);
    if (expense.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, expense.generatorId);
    if (expense.status !== 'PENDING') throw new AppException(ErrorCodes.INVALID_STATE, 'المصروف ليس بانتظار الموافقة', 422);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: { status: 'APPROVED', approvedBy: actor.userId, approvedAt: new Date() },
        include: EXPENSE_INCLUDE,
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'expense.approve', entityType: 'Expense', entityId: id, meta,
      });
      return updated;
    });
  }

  async reject(actor: AuthUser, id: string, dto: RejectExpenseDto, meta: RequestMeta) {
    const expense = await this.loadOwned(actor.organizationId, id);
    if (expense.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, expense.generatorId);
    if (expense.status !== 'PENDING') throw new AppException(ErrorCodes.INVALID_STATE, 'المصروف ليس بانتظار الموافقة', 422);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: { status: 'REJECTED', rejectedReason: dto.reason },
        include: EXPENSE_INCLUDE,
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'expense.reject', entityType: 'Expense', entityId: id,
        metadata: { reason: dto.reason }, meta,
      });
      return updated;
    });
  }
}
