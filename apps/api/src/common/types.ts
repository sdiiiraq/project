import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  deviceId?: string;
}

export type AppRequest = Request & {
  id?: string;
  requestId?: string;
  user?: AuthUser;
  log?: { error: (obj: unknown, msg?: string) => void; info: (obj: unknown, msg?: string) => void };
};

/** استخراج بيانات الطلب للتدقيق (§17) دون تسجيل أي أسرار */
export function metaFromRequest(req: AppRequest): RequestMeta {
  return {
    ipAddress: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    requestId: req.id ?? req.requestId,
    deviceId: typeof req.headers['x-device-id'] === 'string' ? req.headers['x-device-id'] : undefined,
  };
}
