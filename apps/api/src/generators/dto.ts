import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

export const GENERATOR_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'FAULT', 'ARCHIVED'] as const;
export const OPERATING_STATUSES = ['ON', 'OFF', 'MAINTENANCE', 'FAULT', 'UNKNOWN'] as const;
export const FUEL_TYPES = ['DIESEL', 'GASOLINE', 'GAS', 'HYBRID', 'OTHER'] as const;

export class CreateGeneratorDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @IsOptional() @IsString() @MaxLength(40)
  code?: string;

  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) governorate?: string;
  @IsOptional() @Matches(/^07\d{9}$/, { message: 'رقم الهاتف غير صحيح' }) phone?: string;

  @IsOptional() @IsEnum(FUEL_TYPES) fuelType?: string;

  /** السعة تُرسل نصًا لتجنب أي حساب عائم (§77) */
  @IsOptional() @Matches(/^\d{1,9}(\.\d{1,3})?$/, { message: 'قيمة السعة غير صالحة' })
  capacity?: string;

  @IsOptional() @IsString() @MaxLength(300) defaultOperatingSchedule?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateGeneratorDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) governorate?: string;
  @IsOptional() @Matches(/^07\d{9}$/, { message: 'رقم الهاتف غير صحيح' }) phone?: string;
  @IsOptional() @IsEnum(GENERATOR_STATUSES) status?: string;
  @IsOptional() @IsEnum(OPERATING_STATUSES) operatingStatus?: string;
  @IsOptional() @IsEnum(FUEL_TYPES) fuelType?: string;
  @IsOptional() @Matches(/^\d{1,9}(\.\d{1,3})?$/) capacity?: string;
  @IsOptional() @IsString() @MaxLength(300) defaultOperatingSchedule?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ListGeneratorsQuery extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsEnum(GENERATOR_STATUSES) status?: string;
}

export class GeneratorIdParam {
  @IsUUID() id!: string;
}
