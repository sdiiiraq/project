// أرقام الهاتف العراقية: 07XXXXXXXXX (محليًا) أو +9647XXXXXXXXX (دوليًا)
const IRAQI_PHONE_REGEX = /^(?:\+964|0)7\d{9}$/;

export function isIraqiPhone(value: string): boolean {
  return IRAQI_PHONE_REGEX.test(value.trim());
}

// يحوّل أي صيغة مقبولة إلى الصيغة الدولية +9647XXXXXXXXX للتخزين والمقارنة
export function normalizeIraqiPhone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+964")) return trimmed;
  if (trimmed.startsWith("07")) return `+964${trimmed.slice(1)}`;
  return trimmed;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
