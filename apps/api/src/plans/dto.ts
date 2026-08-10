import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const MONEY = /^\d{1,15}(\.\d{1,3})?$/;

export class CreatePlanDto {
  @IsUUID() generatorId!: string;
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @Matches(/^\d{1,5}(\.\d{1,2})?$/, { message: 'قيمة الأمبير غير صالحة' }) ampereAmount!: string;
  @Matches(MONEY, { message: 'قيمة السعر غير صالحة' }) price!: string;
  @IsOptional() @IsEnum(['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'CUSTOM']) billingCycle?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class RevisePlanDto {
  @Matches(MONEY, { message: 'قيمة السعر غير صالحة' }) price!: string;
  /** تاريخ السريان إلزامي لسير عمل تغيير الأسعار (§140) */
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class PlanIdParam {
  @IsUUID() id!: string;
}
