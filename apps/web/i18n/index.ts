import { ar, type Messages } from './messages/ar';
import { en } from './messages/en';

export type Locale = 'ar' | 'en' | 'ku';
export const defaultLocale: Locale = 'ar';
const dictionaries: Record<Locale, Messages> = { ar, en, ku: ar }; // الكردية تستنسخ العربية مؤقتًا حتى تُترجم (§100)

export function getMessages(locale: Locale = defaultLocale): Messages {
  return dictionaries[locale] ?? ar;
}

/** t('nav.dashboard') → ترجمة حسب اللغة الحالية */
export function createT(locale: Locale = defaultLocale) {
  const messages = getMessages(locale);
  return function t(path: string): string {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
      return undefined;
    }, messages);
    return typeof value === 'string' ? value : path;
  };
}
