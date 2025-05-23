import { zhCN } from './zh-cn';
import { enUS } from './en';

export const LOCALE = {
  'zh-cn': zhCN,
  'en': enUS,
};

export type Locale = keyof typeof LOCALE;

export class I18n {
  private locale: Locale = 'en';

  constructor(locale?: string) {
    this.setLocale(locale || 'en');
  }

  setLocale(locale: string) {
    // Map Obsidian language codes to our locale keys
    let mappedLocale: Locale = 'en';

    // Convert to lowercase for case-insensitive matching
    const lowerLocale = locale.toLowerCase();

    // Map language codes to our locale keys
    if (lowerLocale.startsWith('zh')) {
      mappedLocale = 'zh-cn';
    } else if (lowerLocale.startsWith('en')) {
      mappedLocale = 'en';
    }

    // Set the locale if it exists in our translations
    if (mappedLocale in LOCALE) {
      this.locale = mappedLocale;
    } else {
      console.warn(`Locale ${locale} not found, using English as fallback`);
      this.locale = 'en';
    }
  }

  t(key: string): string {
    const translation = LOCALE[this.locale];
    const keys = key.split('.');
    let result: any = translation;

    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = result[k];
      } else {
        return key; // 返回原始键作为后备
      }
    }

    return typeof result === 'string' ? result : key;
  }
}

export const i18n = new I18n();
