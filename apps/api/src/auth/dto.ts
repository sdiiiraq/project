import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const IRAQI_PHONE = /^07\d{9}$/;
const PHONE_MESSAGE = 'رقم الهاتف العراقي يجب أن يبدأ بـ 07 ويتكون من 11 رقماً';

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(120)
  organizationName!: string;

  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @Matches(IRAQI_PHONE, { message: PHONE_MESSAGE })
  phone!: string;

  @IsString() @MinLength(10, { message: 'كلمة المرور 10 أحرف على الأقل (§80)' }) @MaxLength(128)
  password!: string;
}

export class LoginDto {
  @Matches(IRAQI_PHONE, { message: PHONE_MESSAGE })
  phone!: string;

  @IsString() @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @IsString() @MinLength(20)
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1)
  currentPassword!: string;

  @IsString() @MinLength(10, { message: 'كلمة المرور 10 أحرف على الأقل' }) @MaxLength(128)
  newPassword!: string;
}

export class ForgotPasswordDto {
  @Matches(IRAQI_PHONE, { message: PHONE_MESSAGE })
  phone!: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(20)
  token!: string;

  @IsString() @MinLength(10, { message: 'كلمة المرور 10 أحرف على الأقل' }) @MaxLength(128)
  newPassword!: string;
}
