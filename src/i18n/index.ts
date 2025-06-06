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
    console.log(`I18n: Attempting to set locale to '${locale}'`);
    const lowerLocale = locale.toLowerCase();
    let targetLocale: Locale = 'en'; // 默认回退到 'en'

    if (lowerLocale.startsWith('zh')) {
      targetLocale = 'zh-cn';
    } else if (lowerLocale.startsWith('en')) {
      targetLocale = 'en';
    }
    // 如果未来要支持更多语言，在这里加 `else if` 即可
    // else if (lowerLocale.startsWith('de')) { targetLocale = 'de'; }

    // 检查目标语言是否存在于我们的翻译文件中，如果不存在，则使用 'en'
    if (targetLocale in LOCALE) {
      this.locale = targetLocale;
      console.log(`I18n: Successfully set locale to '${this.locale}'`);
    } else {
      this.locale = 'en'; // 最终的保护网
      console.warn(`I18n: Locale '${targetLocale}' is not fully supported, falling back to 'en'`);
    }
  }

  t(key: string): string {
    // 尝试从当前语言获取翻译
    let translatedText = this.getTranslation(key, this.locale);

    // 如果当前语言没有找到，并且当前语言不是英语，则尝试从英语回退
    if (translatedText === null && this.locale !== 'en') {
      console.warn(`I18n: Key '${key}' not found in '${this.locale}', falling back to 'en'.`);
      translatedText = this.getTranslation(key, 'en');
    }

    // 如果最终还是没找到（例如英语文件也漏了），则返回 key 本身
    return translatedText ?? key;
  }

  // 辅助方法，用于查找翻译
  private getTranslation(key: string, locale: Locale): string | null {
    const translation = LOCALE[locale];
    const keys = key.split('.');
    let result: any = translation;

    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = result[k];
      } else {
        return null; // 找不到则返回 null
      }
    }

    return typeof result === 'string' ? result : null;
  }

  getCurrentLocale(): Locale {
    return this.locale;
  }
}

export const i18n = new I18n();
