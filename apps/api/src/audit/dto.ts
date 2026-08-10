import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ListAuditQuery {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  page?: number = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional()
  pageSize?: number = 20;

  @IsOptional() @IsUUID() actorUserId?: string;
  @IsOptional() @IsString() @MaxLength(120) action?: string;
  @IsOptional() @IsString() @MaxLength(80) entityType?: string;
  @IsOptional() @IsString() @MaxLength(64) entityId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
