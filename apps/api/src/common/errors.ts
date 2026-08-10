/** أكواد الأخطاء الموحدة (§74) */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  TENANT_ACCESS_DENIED: 'TENANT_ACCESS_DENIED',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  CONFLICT: 'CONFLICT',
  INVALID_STATE: 'INVALID_STATE',
  BILL_ALREADY_ISSUED: 'BILL_ALREADY_ISSUED',
  PAYMENT_ALREADY_REVERSED: 'PAYMENT_ALREADY_REVERSED',
  DUPLICATE_PAYMENT: 'DUPLICATE_PAYMENT',
  SYNC_CONFLICT: 'SYNC_CONFLICT',
  INSUFFICIENT_PERMISSION: 'INSUFFICIENT_PERMISSION',
  FILE_INVALID: 'FILE_INVALID',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * استثناء التطبيق الموحّد. يُترجم دائمًا إلى تنسيق الخطأ في §73.
 * لا تُمرَّر stack traces إلى العميل في production (§211-34).
 */
export class AppException extends Error {
  constructor(
    readonly code: ErrorCode | string,
    readonly messageText: string,
    readonly httpStatus: number = 400,
    readonly details?: unknown,
  ) {
    super(messageText);
    this.name = 'AppException';
  }
}
