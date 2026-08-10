import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import { StorageService } from '../common/storage.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExportDto } from './dto';

const EXPORT_EXPIRY_DAYS = 7;

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: GeneratorScopeService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async scopedGeneratorFilter(actor: AuthUser, requestedGeneratorId?: string) {
    if (requestedGeneratorId) {
      await this.scope.assertGeneratorAccess(actor.organizationId, actor, requestedGeneratorId);
      return { generatorId: requestedGeneratorId };
    }
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    return allowed ? { generatorId: { in: allowed } } : {};
  }

  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
  }

  private async buildWorkbook(actor: AuthUser, dto: CreateExportDto): Promise<{ buffer: Buffer; rowCount: number }> {
    const workbook = new ExcelJS.Workbook();
    const generatorFilter = await this.scopedGeneratorFilter(actor, dto.generatorId);
    let rowCount = 0;

    if (dto.reportKey === 'customers') {
      const sheet = workbook.addWorksheet('العملاء');
      sheet.columns = [
        { header: 'رقم العميل', key: 'customerNumber', width: 18 },
        { header: 'الاسم', key: 'fullName', width: 28 },
        { header: 'الهاتف', key: 'phonePrimary', width: 16 },
        { header: 'العنوان', key: 'address', width: 30 },
        { header: 'الحالة', key: 'status', width: 14 },
      ];
      const customers = await this.prisma.customer.findMany({
        where: { organizationId: actor.organizationId, deletedAt: null, ...generatorFilter },
        select: { customerNumber: true, fullName: true, phonePrimary: true, address: true, status: true },
        take: 5000,
      });
      sheet.addRows(customers);
      rowCount = customers.length;
    } else if (dto.reportKey === 'bills') {
      const sheet = workbook.addWorksheet('الفواتير');
      sheet.columns = [
        { header: 'رقم الفاتورة', key: 'billNumber', width: 18 },
        { header: 'تاريخ الإصدار', key: 'issueDate', width: 16 },
        { header: 'تاريخ الاستحقاق', key: 'dueDate', width: 16 },
        { header: 'الإجمالي', key: 'totalAmount', width: 14 },
        { header: 'المسدد', key: 'paidAmount', width: 14 },
        { header: 'المتبقي', key: 'outstandingAmount', width: 14 },
        { header: 'الحالة', key: 'status', width: 14 },
      ];
      const bills = await this.prisma.bill.findMany({
        where: {
          organizationId: actor.organizationId,
          ...generatorFilter,
          ...(this.dateRange(dto.from, dto.to) ? { issueDate: this.dateRange(dto.from, dto.to) } : {}),
        },
        select: { billNumber: true, issueDate: true, dueDate: true, totalAmount: true, paidAmount: true, outstandingAmount: true, status: true },
        take: 5000,
      });
      sheet.addRows(bills.map((b) => ({ ...b, totalAmount: b.totalAmount.toString(), paidAmount: b.paidAmount.toString(), outstandingAmount: b.outstandingAmount.toString() })));
      rowCount = bills.length;
    } else if (dto.reportKey === 'payments') {
      const sheet = workbook.addWorksheet('الدفعات');
      sheet.columns = [
        { header: 'رقم الدفعة', key: 'paymentNumber', width: 18 },
        { header: 'التاريخ', key: 'paymentDate', width: 16 },
        { header: 'المبلغ', key: 'amount', width: 14 },
        { header: 'طريقة الدفع', key: 'paymentMethod', width: 16 },
        { header: 'الحالة', key: 'status', width: 14 },
      ];
      const payments = await this.prisma.payment.findMany({
        where: {
          organizationId: actor.organizationId,
          ...generatorFilter,
          ...(this.dateRange(dto.from, dto.to) ? { paymentDate: this.dateRange(dto.from, dto.to) } : {}),
        },
        select: { paymentNumber: true, paymentDate: true, amount: true, paymentMethod: true, status: true },
        take: 5000,
      });
      sheet.addRows(payments.map((p) => ({ ...p, amount: p.amount.toString() })));
      rowCount = payments.length;
    } else if (dto.reportKey === 'expenses') {
      const sheet = workbook.addWorksheet('المصاريف');
      sheet.columns = [
        { header: 'التاريخ', key: 'expenseDate', width: 16 },
        { header: 'الوصف', key: 'description', width: 32 },
        { header: 'المبلغ', key: 'amount', width: 14 },
        { header: 'طريقة الدفع', key: 'paymentMethod', width: 16 },
        { header: 'الحالة', key: 'status', width: 14 },
      ];
      const expenses = await this.prisma.expense.findMany({
        where: {
          organizationId: actor.organizationId,
          ...generatorFilter,
          ...(this.dateRange(dto.from, dto.to) ? { expenseDate: this.dateRange(dto.from, dto.to) } : {}),
        },
        select: { expenseDate: true, description: true, amount: true, paymentMethod: true, status: true },
        take: 5000,
      });
      sheet.addRows(expenses.map((e) => ({ ...e, amount: e.amount.toString() })));
      rowCount = expenses.length;
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(arrayBuffer), rowCount };
  }

  async create(actor: AuthUser, dto: CreateExportDto, meta: RequestMeta) {
    const job = await this.prisma.exportJob.create({
      data: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        reportKey: dto.reportKey,
        format: 'xlsx',
        params: { generatorId: dto.generatorId, from: dto.from, to: dto.to },
        status: 'RUNNING',
        expiresAt: new Date(Date.now() + EXPORT_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    try {
      const { buffer, rowCount } = await this.buildWorkbook(actor, dto);
      const objectKey = await this.storage.save(actor.organizationId, buffer, 'xlsx');
      const stored = await this.prisma.storedFile.create({
        data: {
          organizationId: actor.organizationId,
          entityKind: 'export_job',
          entityId: job.id,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          extension: 'xlsx',
          sizeBytes: BigInt(buffer.length),
          objectKey,
          originalName: `${dto.reportKey}-export.xlsx`,
          uploadedBy: actor.userId,
        },
      });
      const completed = await this.prisma.exportJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', fileId: stored.id, rowCount, completedAt: new Date() },
      });
      await this.audit.log({
        organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'export.create', entityType: 'ExportJob', entityId: job.id,
        metadata: { reportKey: dto.reportKey, rowCount }, meta,
      });
      return completed;
    } catch (err) {
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: err instanceof Error ? err.message : 'فشل غير معروف' },
      });
      throw err;
    }
  }

  async list(organizationId: string, userId: string) {
    return this.prisma.exportJob.findMany({
      where: { organizationId, userId },
      orderBy: { requestedAt: 'desc' },
      take: 50,
    });
  }

  async download(organizationId: string, id: string) {
    const job = await this.prisma.exportJob.findFirst({ where: { id, organizationId } });
    if (!job) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'مهمة التصدير غير موجودة', 404);
    if (job.status !== 'COMPLETED' || !job.fileId) {
      throw new AppException(ErrorCodes.INVALID_STATE, 'مهمة التصدير غير مكتملة', 422);
    }
    if (job.expiresAt < new Date()) {
      throw new AppException(ErrorCodes.INVALID_STATE, 'انتهت صلاحية ملف التصدير', 410);
    }
    const file = await this.prisma.storedFile.findFirst({ where: { id: job.fileId, organizationId } });
    if (!file) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الملف غير موجود', 404);
    const buffer = await this.storage.read(file.objectKey);
    return { buffer, mimeType: file.mimeType, originalName: file.originalName ?? `${job.reportKey}.xlsx` };
  }
}
