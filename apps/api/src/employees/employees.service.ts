import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto, EmployeeQuery, UpdateEmployeeDto } from './dto';

const FINANCIAL_SALARY_ROLES = new Set(['SUPER_ADMIN', 'ORGANIZATION_OWNER']);

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
  ) {}

  /** الراتب يُعرض فقط للمخولين ماليًا (§52): المالك/المشرف المالي */
  private canSeeSalary(actor: AuthUser): boolean {
    return actor.roles.some((r) => FINANCIAL_SALARY_ROLES.has(r)) || actor.permissions.includes('financial_reports.read');
  }

  private maskSalary<T extends { salary: unknown }>(rows: T[], canSee: boolean): T[] {
    if (canSee) return rows;
    return rows.map((r) => ({ ...r, salary: null }));
  }

  async list(actor: AuthUser, query: EmployeeQuery) {
    const where = {
      organizationId: actor.organizationId,
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        include: { generator: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items: this.maskSalary(items, this.canSeeSalary(actor)), meta: { page, pageSize, total } };
  }

  async get(actor: AuthUser, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: { generator: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } },
    });
    if (!employee) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الموظف غير موجود', 404);
    return this.maskSalary([employee], this.canSeeSalary(actor))[0];
  }

  async create(actor: AuthUser, dto: CreateEmployeeDto, meta: RequestMeta) {
    if (dto.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    const existing = await this.prisma.employee.findFirst({
      where: { organizationId: actor.organizationId, employeeCode: dto.employeeCode },
    });
    if (existing) throw new AppException(ErrorCodes.DUPLICATE_RESOURCE, 'رمز الموظف مستخدم مسبقاً', 409);

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: dto.generatorId,
          userId: dto.userId,
          name: dto.name,
          phone: dto.phone,
          role: dto.role,
          employeeCode: dto.employeeCode,
          salary: dto.salary,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
          status: 'ACTIVE',
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'employee.create', entityType: 'Employee', entityId: employee.id,
        after: { name: dto.name, role: dto.role, employeeCode: dto.employeeCode }, meta,
      });
      return this.maskSalary([employee], this.canSeeSalary(actor))[0];
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateEmployeeDto, meta: RequestMeta) {
    const employee = await this.prisma.employee.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!employee) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الموظف غير موجود', 404);
    if (dto.generatorId) await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: { ...dto, ...(dto.hireDate ? { hireDate: new Date(dto.hireDate) } : {}) },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: dto.status === 'INACTIVE' ? 'employee.disable' : 'employee.update',
        entityType: 'Employee', entityId: id,
        before: { status: employee.status }, after: { status: updated.status }, meta,
      });
      return this.maskSalary([updated], this.canSeeSalary(actor))[0];
    });
  }
}
