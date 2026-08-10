import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ReportRangeQuery {
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
