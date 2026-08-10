import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(160) legalName?: string;
  @IsOptional() @Matches(/^07\d{9}$/, { message: 'رقم الهاتف غير صحيح' }) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) governorate?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsIn(['ar', 'en', 'ku']) defaultLanguage?: string;
}
