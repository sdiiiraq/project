import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

const MONEY = /^\d{1,15}(\.\d{1,3})?$/;

export class CreateSubscriptionDto {
  @IsUUID() customerId!: string;
  @IsUUID() amperePlanId!: string;

  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsEnum(['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'CUSTOM']) billingCycle?: string;

  /** سعر مخصص (اختياري) — نصي لتجنّب أي حساب عائم (§77) */
  @IsOptional() @Matches(MONEY, { message: 'قيمة السعر غير صالحة' }) customPrice?: string;
  @IsOptional() @Matches(/^\d{1,5}(\.\d{1,2})?$/, { message: 'قيمة الأمبير غير صالحة' }) customAmpere?: string;

  @IsOptional() @IsEnum(['FIXED', 'PERCENTAGE']) discountType?: string;
  @IsOptional() @Matches(MONEY) discountValue?: string;

  @IsOptional() @IsInt() @Min(1) @Max(28) billingDay?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional() @IsUUID() amperePlanId?: string;
  @IsOptional() @Matches(MONEY) customPrice?: string;
  @IsOptional() @Matches(/^\d{1,5}(\.\d{1,2})?$/) customAmpere?: string;
  @IsOptional() @IsEnum(['FIXED', 'PERCENTAGE']) discountType?: string;
  @IsOptional() @Matches(MONEY) discountValue?: string;
  @IsOptional() @IsInt() @Min(1) @Max(28) billingDay?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CancelSubscriptionDto {
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
}

export class ListSubscriptionsQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsEnum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED']) status?: string;
}

export class SubscriptionIdParam {
  @IsUUID() id!: string;
}
