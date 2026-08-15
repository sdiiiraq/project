// يمنع تشابه أسماء أصحاب المولدات في لوحة إدارة المنصة — نطلب اسمًا ثلاثيًا حقيقيًا لا اسم Google أو اسمًا مختصرًا.
export function isTripleName(name: string): boolean {
  return name.trim().split(/\s+/).filter(Boolean).length >= 3;
}
