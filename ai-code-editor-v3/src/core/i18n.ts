// ============================================================
// i18n Framework — lightweight internationalization without deps
// ============================================================

type LocaleMap = Record<string, string>;

interface I18nConfig {
  defaultLocale: string;
  fallbackLocale: string;
  supportedLocales: string[];
}

class I18n {
  private config: I18nConfig = {
    defaultLocale: 'zh-CN',
    fallbackLocale: 'en',
    supportedLocales: ['zh-CN', 'en'],
  };

  private currentLocale: string = '';
  private translations = new Map<string, LocaleMap>();
  private listeners: (() => void)[] = [];

  // ─── Configuration ──────────────────────────────────────
  configure(config: Partial<I18nConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ─── Load Translations ─────────────────────────────────
  async loadLocale(locale: string, translations: LocaleMap): Promise<void> {
    this.translations.set(locale, translations);
    if (!this.currentLocale) {
      this.currentLocale = this.detectLocale();
    }
    this.notify();
  }

  // ─── Detect User Locale ────────────────────────────────
  private detectLocale(): string {
    // 1. Stored preference
    const stored = localStorage.getItem('aice:locale');
    if (stored && this.config.supportedLocales.includes(stored)) {
      return stored;
    }

    // 2. Browser language
    const browserLang = navigator.language;
    if (browserLang.startsWith('zh')) return 'zh-CN';
    if (this.config.supportedLocales.includes(browserLang)) return browserLang;

    // 3. Fallback
    return this.config.defaultLocale;
  }

  // ─── Translation Function ──────────────────────────────
  t(key: string, params?: Record<string, string | number>): string {
    const translations = this.translations.get(this.currentLocale);
    let text = translations?.[key] || this.translations.get(this.config.fallbackLocale)?.[key] || key;

    // Interpolation: {name} → value
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }

    return text;
  }

  // ─── Locale Management ─────────────────────────────────
  setLocale(locale: string): void {
    if (!this.config.supportedLocales.includes(locale)) return;
    this.currentLocale = locale;
    localStorage.setItem('aice:locale', locale);
    this.notify();
    document.documentElement.lang = locale;
  }

  getLocale(): string {
    return this.currentLocale || this.config.defaultLocale;
  }

  getSupportedLocales(): string[] {
    return this.config.supportedLocales;
  }

  // ─── Subscription ──────────────────────────────────────
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  // ─── HTML Attribute Translation ────────────────────────
  translateDOM(root: HTMLElement = document.body): void {
    // Find all elements with data-i18n attribute
    const elements = root.querySelectorAll('[data-i18n]');
    for (const el of elements) {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = this.t(key);
      }
    }

    // Find all elements with data-i18n-title
    const titleEls = root.querySelectorAll('[data-i18n-title]');
    for (const el of titleEls) {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        el.setAttribute('title', this.t(key));
      }
    }

    // Find all inputs with data-i18n-placeholder
    const placeholderEls = root.querySelectorAll('[data-i18n-placeholder]');
    for (const el of placeholderEls) {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key && el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        (el as HTMLInputElement).placeholder = this.t(key);
      }
    }
  }
}

// ─── Singleton ───────────────────────────────────────────
export const i18n = new I18n();

// ─── Convenience export ──────────────────────────────────
export const t = i18n.t.bind(i18n);

// ─── Initialization ─────────────────────────────────────
export async function initI18n(): Promise<void> {
  // Load both locale files
  const [zhCN, en] = await Promise.all([
    import('../i18n/zh-CN.json').then((m) => m.default),
    import('../i18n/en.json').then((m) => m.default),
  ]);

  await i18n.loadLocale('zh-CN', zhCN as LocaleMap);
  await i18n.loadLocale('en', en as LocaleMap);

  // Set document language
  document.documentElement.lang = i18n.getLocale();

  // Apply translations to DOM
  i18n.translateDOM();

  // Re-apply on locale change
  i18n.subscribe(() => i18n.translateDOM());
}

// ─── Language Switcher Component ────────────────────────
export function createLanguageSwitcher(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'lang-switcher';
  container.style.cssText = 'display:flex;align-items:center;gap:4px;';

  const locales: { code: string; label: string; flag: string }[] = [
    { code: 'zh-CN', label: '中文', flag: '🇨🇳' },
    { code: 'en', label: 'EN', flag: '🇺🇸' },
  ];

  for (const loc of locales) {
    const btn = document.createElement('button');
    btn.textContent = `${loc.flag} ${loc.label}`;
    btn.title = `Switch to ${loc.label}`;
    btn.style.cssText = [
      'background: transparent',
      'border: 1px solid var(--border-color)',
      'border-radius: 4px',
      'color: var(--text-primary)',
      'cursor: pointer',
      'font-size: 11px',
      'padding: 2px 6px',
      i18n.getLocale() === loc.code ? 'background: var(--info); color: white;' : '',
    ].join(';');

    btn.addEventListener('click', () => {
      i18n.setLocale(loc.code);
      container.querySelectorAll('button').forEach((b) => {
        const code = locales.find((l) => b.textContent?.includes(l.flag));
        if (code) {
          b.style.background = i18n.getLocale() === code.code ? 'var(--info)' : 'transparent';
          b.style.color = i18n.getLocale() === code.code ? 'white' : 'var(--text-primary)';
        }
      });
    });

    container.appendChild(btn);
  }

  return container;
}
