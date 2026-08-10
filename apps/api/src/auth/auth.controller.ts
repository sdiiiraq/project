import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AuthUser, Public } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AuthUser as AuthUserType, AppRequest } from '../common/types';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto, ForgotPasswordDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: AppRequest) {
    return this.authService.register(dto, metaFromRequest(req));
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: AppRequest) {
    return this.authService.login(dto, metaFromRequest(req));
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: AppRequest) {
    return this.authService.refresh(dto, metaFromRequest(req));
  }

  @Post('logout')
  logout(@Body() dto: RefreshDto, @Req() req: AppRequest) {
    return this.authService.logout(dto, metaFromRequest(req));
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: AppRequest) {
    return this.authService.forgotPassword(dto, metaFromRequest(req));
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: AppRequest) {
    return this.authService.resetPassword(dto, metaFromRequest(req));
  }

  @Get('me')
  me(@AuthUser() user: AuthUserType) {
    return this.authService.me(user.userId);
  }

  @Post('change-password')
  changePassword(@AuthUser() user: AuthUserType, @Body() dto: ChangePasswordDto, @Req() req: AppRequest) {
    return this.authService.changePassword(user.userId, dto, metaFromRequest(req));
  }
}
