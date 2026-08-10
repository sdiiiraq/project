import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';
import { CreatePaymentDto } from '../payments/dto';

const MONEY = /^\d{1,15}(\.\d{1,3})?$/;

/** دفعة يسجلها الجابي — نفس بنية الدفعة مع فرض سياق الجابي والجلسة */
export class CollectorPaymentDto extends CreatePaymentDto {}

export class OpenSessionDto {
  @IsUUID() generatorId!: string;
  @IsOptional() @IsDateString() sessionDate?: string;
  @IsOptional() @Matches(MONEY) openingBalance?: string;
}

export class SubmitSessionDto {
  @Matches(MONEY, { message: 'قيمة النقد المقدم غير صالحة' }) cashSubmitted!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ReconcileSessionDto {
  @IsEnum(['RECONCILED', 'DISPUTED']) outcome!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreateCollectorDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @Matches(/^07\d{9}$/, { message: 'رقم الهاتف غير صحيح' }) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) employeeCode?: string;
}

export class UpdateCollectorDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @Matches(/^07\d{9}$/) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) employeeCode?: string;
  @IsOptional() @IsEnum(['ACTIVE', 'DISABLED']) status?: string;
}

export class CreateAssignmentDto {
  @IsUUID() collectorId!: string;
  @IsUUID() generatorId!: string;
  @IsUUID() customerId!: string;
}

export class SessionIdParam {
  @IsUUID() id!: string;
}

export class CollectorIdParam {
  @IsUUID() id!: string;
}

export class AssignmentIdParam {
  @IsUUID() id!: string;
}

export class ListSessionsQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() collectorId?: string;
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsEnum(['OPEN', 'SUBMITTED', 'RECONCILED', 'DISPUTED', 'APPROVED']) status?: string;
}
