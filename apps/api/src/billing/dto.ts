import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

const MONEY = /^\d{1,15}(\.\d{1,3})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const BILL_STATUSES = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'] as const;
export const ADJUSTMENT_TYPES = ['DISCOUNT', 'PENALTY', 'CREDIT', 'DEBIT', 'CORRECTION', 'REFUND'] as const;

export class GenerateBillsDto {
  @IsUUID() generatorId!: string;
  @Matches(DAY, { message: 'التاريخ بصيغة yyyy-mm-dd' }) periodStart!: string;
  @Matches(DAY, { message: 'التاريخ بصيغة yyyy-mm-dd' }) periodEnd!: string;
  @IsOptional() @IsString() @MaxLength(64) idempotencyKey?: string;
}

export class AdjustBillDto {
  @IsEnum(ADJUSTMENT_TYPES) type!: string;
  @Matches(MONEY, { message: 'قيمة المبلغ غير صالحة' }) amount!: string;
  @IsString() @MinLength(3, { message: 'السبب إلزامي (3 أحرف على الأقل)' }) @MaxLength(500) reason!: string;
  @IsOptional() @IsEnum(['INCREASE', 'DECREASE']) direction?: string;
}

export class VoidBillDto {
  @IsString() @MinLength(3, { message: 'سبب الإبطال إلزامي' }) @MaxLength(500) reason!: string;
}

export class ListBillsQuery extends PaginationQueryDto {
  @IsOptional() @IsEnum(BILL_STATUSES) status?: string;
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
}

export class BillIdParam {
  @IsUUID() id!: string;
}

export class IssueBulkDto {
  @IsUUID() runId!: string;
}

export class BillingConfigDto {
  @IsOptional() @IsBoolean() roundToInteger?: boolean;
  @IsOptional() @IsEnum(['HALF_UP', 'DOWN']) roundingMode?: string;
  @IsOptional() @Matches(MONEY) minimumCharge?: string;
  @IsOptional() @IsBoolean() includePreviousDebt?: boolean;
  @IsOptional() @IsEnum(['PRORATE', 'FULL']) partialPeriodPolicy?: string;
  @IsOptional() @IsInt() gracePeriodDays?: number;
  @IsOptional() latePenalty?: { enabled: boolean; type: 'FIXED' | 'PERCENTAGE'; value: string };
  @IsOptional() @Matches(MONEY) adjustmentApprovalThreshold?: string;
}
