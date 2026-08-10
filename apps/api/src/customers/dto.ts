import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

const IRAQI_PHONE = /^07\d{9}$/;

export class CreateCustomerDto {
  @IsUUID() generatorId!: string;

  @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @Matches(IRAQI_PHONE, { message: 'رقم الهاتف الأساسي غير صحيح' }) phonePrimary!: string;
  @IsOptional() @Matches(IRAQI_PHONE, { message: 'رقم الهاتف الثانوي غير صحيح' }) phoneSecondary?: string;

  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(80) neighborhood?: string;
  @IsOptional() @IsString() @MaxLength(40) houseNumber?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;

  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @IsOptional() @Matches(IRAQI_PHONE) phonePrimary?: string;
  @IsOptional() @Matches(IRAQI_PHONE) phoneSecondary?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(80) neighborhood?: string;
  @IsOptional() @IsString() @MaxLength(40) houseNumber?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ArchiveReasonDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ListCustomersQuery extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsEnum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']) status?: string;
  @IsOptional() @IsUUID() generatorId?: string;
}

export class CustomerIdParam {
  @IsUUID() id!: string;
}
