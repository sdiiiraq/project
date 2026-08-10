import { AppException, ErrorCodes } from './errors';

/** تحويل yyyy-mm-dd إلى منتصف الليل UTC — حتمي وبلا غموض مناطق (§78) */
export function parseDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) throw new AppException(ErrorCodes.VALIDATION_ERROR, 'صيغة التاريخ غير صالحة (yyyy-mm-dd)', 422);
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(date.getTime())) {
    throw new AppException(ErrorCodes.VALIDATION_ERROR, 'التاريخ غير صالح', 422);
  }
  return date;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
