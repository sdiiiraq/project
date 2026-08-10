import { Decimal } from '@prisma/client/runtime/library';
import { AppException, ErrorCodes } from './errors';

/** ثوابت تحويل حتمية إلى اللتر (§77) — مرجع واحد لكل الوحدات */
const TO_LITER: Record<string, Decimal> = {
  LITER: new Decimal(1),
  GALLON: new Decimal('3.785411784'),
  BARREL: new Decimal('158.987294928'),
};

export function toLiters(quantity: Decimal | string, unit: string): Decimal {
  const factor = TO_LITER[unit];
  if (!factor) throw new AppException(ErrorCodes.VALIDATION_ERROR, 'وحدة قياس غير معروفة', 422);
  return new Decimal(quantity).mul(factor);
}
