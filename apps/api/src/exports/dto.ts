import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export const EXPORT_REPORT_KEYS = ['customers', 'bills', 'payments', 'expenses'] as const;
export type ExportReportKey = (typeof EXPORT_REPORT_KEYS)[number];

export class CreateExportDto {
  @IsEnum(EXPORT_REPORT_KEYS) reportKey!: ExportReportKey;
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class IdParam {
  @IsUUID() id!: string;
}
