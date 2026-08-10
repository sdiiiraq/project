import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

const MONEY = /^\d{1,15}(\.\d{1,3})?$/;

export class CreateMaintenanceDto {
  @IsUUID() generatorId!: string;
  @IsString() @MinLength(2) @MaxLength(80) type!: string;
  @IsOptional() @IsDateString() date?: string;
  @IsString() @MinLength(3) @MaxLength(1000) description!: string;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsOptional() @Matches(MONEY) cost?: string;
  @IsOptional() @IsDateString() nextMaintenanceDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) runtimeAtMaintenance?: number;
}

export class UpdateMaintenanceDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) type?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(1000) description?: string;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsOptional() @Matches(MONEY) cost?: string;
  @IsOptional() @IsDateString() nextMaintenanceDate?: string;
}

export class CompleteMaintenanceDto {
  @IsOptional() @Matches(MONEY) cost?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) runtimeAtMaintenance?: number;
  @IsOptional() @IsDateString() nextMaintenanceDate?: string;
}

export class CreateSparePartDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @Type(() => Number) @IsInt() @Min(0) quantity!: number;
  @IsOptional() @Matches(MONEY) unitCost?: string;
}

export class AddPartDto {
  @IsUUID() sparePartId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
}

export class MaintenanceQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsEnum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) status?: string;
}

export class MaintenanceIdParam {
  @IsUUID() id!: string;
}
