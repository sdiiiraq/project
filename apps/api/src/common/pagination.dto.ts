import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional()
  page?: number = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional()
  pageSize?: number = 20;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}
