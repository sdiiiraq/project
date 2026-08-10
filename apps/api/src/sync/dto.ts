import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export class SyncPushTransactionDto {
  @IsUUID() clientTransactionId!: string;
  @IsString() @MaxLength(40) entityType!: string;
  @IsObject() payload!: Record<string, unknown>;
  @IsDateString() createdOfflineAt!: string;
}

export class SyncPushDto {
  @IsString() @MaxLength(120) deviceId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SyncPushTransactionDto)
  transactions!: SyncPushTransactionDto[];
}

export class ResolveConflictDto {
  @IsUUID() syncTransactionId!: string;
  @IsEnum(['APPLY', 'REJECT']) action!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SyncStatusQuery {
  @IsOptional() @IsString() @MaxLength(120) deviceId?: string;
}
