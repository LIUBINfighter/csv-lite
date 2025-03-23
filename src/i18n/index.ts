import { zhCN } from './zh-cn';
import { enUS } from './en';

export const LOCALE = {
  'zh-cn': zhCN,
  'en': enUS,
};

export type Locale = keyof typeof LOCALE;

export class I18n {
  private locale: Locale = 'zh-cn';

  constructor(locale?: Locale) {
    if (locale && locale in LOCALE) {
      this.locale = locale;
    }
  }

  setLocale(locale: Locale) {
    if (locale in LOCALE) {
      this.locale = locale;
    } else {
      console.warn(`Locale ${locale} not found, using current locale`);
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
