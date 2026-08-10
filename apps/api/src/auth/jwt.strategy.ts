import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../common/types';

export interface JwtAccessPayload {
  sub: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') as string,
    });
  }

  validate(payload: JwtAccessPayload): AuthUser {
    return {
      userId: payload.sub,
      organizationId: payload.organizationId,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
