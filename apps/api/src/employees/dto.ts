import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

const MONEY = /^\d{1,15}(\.\d{1,3})?$/;

export class CreateEmployeeDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @Matches(/^07\d{9}$/, { message: 'رقم الهاتف غير صحيح' }) phone?: string;
  @IsString() @MinLength(2) @MaxLength(80) role!: string;
  @IsString() @MinLength(1) @MaxLength(40) employeeCode!: string;
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @Matches(MONEY) salary?: string;
  @IsOptional() @IsDateString() hireDate?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @Matches(/^07\d{9}$/) phone?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) role?: string;
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @Matches(MONEY) salary?: string;
  @IsOptional() @IsEnum(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @IsDateString() hireDate?: string;
}

export class EmployeeQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsEnum(['ACTIVE', 'INACTIVE']) status?: string;
}

export class EmployeeIdParam {
  @IsUUID() id!: string;
}
