import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const ASSIGNABLE_ROLES = [
  'GENERATOR_OWNER', 'GENERATOR_MANAGER', 'ACCOUNTANT', 'COLLECTOR', 'TECHNICIAN',
] as const;

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @Matches(/^07\d{9}$/, { message: 'رقم الهاتف العراقي يجب أن يبدأ بـ 07 ويتكون من 11 رقماً' })
  phone!: string;

  @IsString() @MinLength(10, { message: 'كلمة المرور 10 أحرف على الأقل' }) @MaxLength(128)
  password!: string;

  @IsIn(ASSIGNABLE_ROLES, { message: 'الدور غير مسموح' })
  roleName!: string;
}

export class UpdateUserStatusDto {
  @IsIn(['ACTIVE', 'DISABLED']) status!: string;
}
