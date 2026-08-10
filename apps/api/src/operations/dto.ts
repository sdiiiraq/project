import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

export const RUNTIME_SOURCES = ['MANUAL', 'IOT', 'IMPORTED'] as const;
export const OUTAGE_TYPES = ['PLANNED', 'UNPLANNED'] as const;
export const OPERATING_STATUSES = ['ON', 'OFF', 'MAINTENANCE', 'FAULT', 'UNKNOWN'] as const;

export class StartRuntimeDto {
  @IsUUID() generatorId!: string;
  @IsOptional() @IsDateString() startTime?: string;
  @IsOptional() @IsEnum(RUNTIME_SOURCES) source?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class StopRuntimeDto {
  @IsOptional() @IsDateString() endTime?: string;
}

export class StartOutageDto {
  @IsUUID() generatorId!: string;
  @IsEnum(OUTAGE_TYPES) type!: string;
  @IsString() @MaxLength(200) reason!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsDateString() startedAt?: string;
}

export class EndOutageDto {
  @IsOptional() @IsDateString() endedAt?: string;
}

export class ChangeOperatingStatusDto {
  @IsUUID() generatorId!: string;
  @IsEnum(OPERATING_STATUSES) status!: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class CreateActivityDto {
  @IsUUID() generatorId!: string;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsString() @MaxLength(80) activityType!: string;
  @IsString() @MaxLength(500) description!: string;
}

export class CreateOilChangeDto {
  @IsUUID() generatorId!: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) runtimeHours?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class RuntimeQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() generatorId?: string;
}

export class OutageQuery extends PaginationQueryDto {
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsEnum(OUTAGE_TYPES) type?: string;
}

export class IdParam {
  @IsUUID() id!: string;
}
