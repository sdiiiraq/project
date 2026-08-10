import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

const MONEY = /^\d{1,15}(\.\d{1,3})?$/;

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'ONLINE', 'OTHER'] as const;

export class CreatePaymentDto {
  @IsUUID() customerId!: string;

  /** فاتورة محددة (دفع من سياق فاتورة) — إن تُركت فارغة يُطبق التخصيص على أقدم الديون (§114) */
  @IsOptional() @IsUUID() billId?: string;

  @Matches(MONEY, { message: 'قيمة المبلغ غير صالحة' }) amount!: string;

  @IsOptional() @IsEnum(PAYMENT_METHODS) paymentMethod?: string;
  @IsOptional() @IsDateString() paymentDate?: string;
  @IsOptional() @IsString() @MaxLength(80) referenceNumber?: string;

  /** مفتاح idempotency للمزامنة دون اتصال (§21) — فريد ضمن المنظمة */
  @IsOptional() @IsString() @MaxLength(64) offlineTransactionId?: string;

  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ReversePaymentDto {
  @IsString() @MinLength(3, { message: 'سبب العكس إلزامي' }) @MaxLength(500) reason!: string;
}

export class ListPaymentsQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() collectorId?: string;
  @IsOptional() @IsEnum(['COMPLETED', 'REVERSED']) status?: string;
  @IsOptional() @IsEnum(PAYMENT_METHODS) method?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class PaymentIdParam {
  @IsUUID() id!: string;
}
