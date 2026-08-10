import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

const MONEY = /^\d{1,15}(\.\d{1,3})?$/;
const QTY = /^\d{1,11}(\.\d{1,3})?$/;

export const FUEL_UNITS = ['LITER', 'GALLON', 'BARREL'] as const;

export class CreateSupplierDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @Matches(/^07\d{9}$/, { message: 'رقم الهاتف غير صحيح' }) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @Matches(/^07\d{9}$/) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreatePurchaseDto {
  @IsUUID() generatorId!: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @Matches(QTY, { message: 'قيمة الكمية غير صالحة' }) quantity!: string;
  @IsEnum(FUEL_UNITS) unit!: string;
  @Matches(MONEY, { message: 'قيمة سعر الوحدة غير صالحة' }) unitCost!: string;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsString() @MaxLength(80) invoiceNumber?: string;
  @IsOptional() @IsUUID() attachmentKey?: string;
}

export class RejectPurchaseDto {
  @IsString() @MinLength(3, { message: 'سبب الرفض إلزامي' }) @MaxLength(500) reason!: string;
}

export class AdjustInventoryDto {
  @IsUUID() generatorId!: string;
  @Matches(QTY) quantity!: string;
  @IsEnum(FUEL_UNITS) unit!: string;
  @IsEnum(['INCREASE', 'DECREASE']) direction!: string;
  @IsString() @MinLength(3, { message: 'ملاحظة التسوية إلزامية' }) @MaxLength(500) notes!: string;
}

export class CreateConsumptionDto {
  @IsUUID() generatorId!: string;
  @Matches(QTY) quantity!: string;
  @IsEnum(FUEL_UNITS) unit!: string;
  @IsOptional() @IsEnum(['MANUAL', 'IOT', 'IMPORTED']) source?: string;
  @IsOptional() @IsDateString() recordedAt?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class PurchaseQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsEnum(['PENDING', 'APPROVED', 'REJECTED']) status?: string;
}

export class ConsumptionQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() generatorId?: string;
}

export class InventoryQuery {
  @IsOptional() @IsUUID() generatorId?: string;
}

export class AnalyticsQuery {
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class FuelConfigDto {
  @IsOptional() @Matches(QTY) expectedLitersPerHour?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) varianceThresholdPercent?: number;
  @IsOptional() @Matches(MONEY) purchaseApprovalThreshold?: string;
}

export class IdParam {
  @IsUUID() id!: string;
}
