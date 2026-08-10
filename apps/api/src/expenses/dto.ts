import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

const MONEY = /^\d{1,15}(\.\d{1,3})?$/;
export const EXPENSE_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'ONLINE', 'OTHER'] as const;

export class CreateCategoryDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) nameAr?: string;
}

export class CreateExpenseDto {
  @IsOptional() @IsUUID() generatorId?: string;
  @IsUUID() categoryId!: string;
  @Matches(MONEY, { message: 'قيمة المبلغ غير صالحة' }) amount!: string;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsDateString() expenseDate!: string;
  @IsString() @MinLength(3) @MaxLength(500) description!: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsEnum(EXPENSE_PAYMENT_METHODS) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(80) referenceNumber?: string;
  @IsOptional() @IsUUID() attachmentKey?: string;
}

export class UpdateExpenseDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @Matches(MONEY) amount?: string;
  @IsOptional() @IsDateString() expenseDate?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) description?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsEnum(EXPENSE_PAYMENT_METHODS) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(80) referenceNumber?: string;
}

export class RejectExpenseDto {
  @IsString() @MinLength(3, { message: 'سبب الرفض إلزامي' }) @MaxLength(500) reason!: string;
}

export class ExpenseQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(['PENDING', 'APPROVED', 'REJECTED']) status?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class IdParam {
  @IsUUID() id!: string;
}
