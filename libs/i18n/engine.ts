// Pure i18n engine — no React, no MMKV, no platform deps.
//
// Why pure: the engine is unit-tested under bun (Node), so it must not touch
// react-native, expo, or the MMKV native binding. The provider on top
// (`index.tsx`) handles persistence and React state.
//
// Resolution order for a key:
//   1. The active locale's catalog.
//   2. zh-Hant via OpenCC s2twp/tw2sp when the active locale is `zh-Hans`
//      and the key is missing — saves contributors from re-typing keys that
//      only differ by character form.
//   3. English (canonical fallback).
//   4. The key itself (so missing keys are still distinguishable in the UI).
//
// Catalogs are imported as JSON. TypeScript infers the shape automatically
// when `resolveJsonModule` is on (it already is — `expo/tsconfig.base`).
// `TranslationKey` is derived in `types.ts` from `typeof en` — adding a key
// to `en.json` immediately type-checks everywhere, no codegen needed.

import { toSimplified, toTraditional } from '../utils/chinese-converter';
import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import zhHans from './locales/zh-Hans.json';
import zhHant from './locales/zh-Hant.json';
import type {
  LanguageId,
  LanguageMeta,
  TranslationKey,
  TranslationValues,
} from './types';

export const LANGUAGES: Record<LanguageId, LanguageMeta> = {
  en: { id: 'en', nativeName: 'English', englishName: 'English', flag: '🇬🇧' },
  'zh-Hant': {
    id: 'zh-Hant',
    nativeName: '繁體中文',
    englishName: 'Traditional Chinese',
    flag: '🇹🇼',
  },
  'zh-Hans': {
    id: 'zh-Hans',
    nativeName: '简体中文',
    englishName: 'Simplified Chinese',
    flag: '🇨🇳',
    derivesFromTraditional: true,
  },
  ja: { id: 'ja', nativeName: '日本語', englishName: 'Japanese', flag: '🇯🇵' },
  ko: { id: 'ko', nativeName: '한국어', englishName: 'Korean', flag: '🇰🇷' },
};

export const LANGUAGE_IDS: LanguageId[] = ['en', 'zh-Hant', 'zh-Hans', 'ja', 'ko'];

const CATALOGS: Record<LanguageId, unknown> = {
  en,
  'zh-Hant': zhHant,
  'zh-Hans': zhHans,
  ja,
  ko,
};

function getByPath(catalog: unknown, key: string): string | undefined {
  if (!catalog || typeof catalog !== 'object') return undefined;
  const segments = key.split('.');
  let cursor: unknown = catalog;
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

const INTERPOLATION_RE = /\{(\w+)\}/g;

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(INTERPOLATION_RE, (_, name: string) => {
    const v = values[name];
    return v == null ? `{${name}}` : String(v);
  });
}

/**
 * Map a BCP-47 / system locale tag to one of our supported language ids.
 * Examples:
 *   en, en-US, en-GB → en
 *   zh, zh-Hant, zh-TW, zh-HK → zh-Hant
 *   zh-Hans, zh-CN, zh-SG → zh-Hans
 *   ja, ja-JP → ja
 *   ko, ko-KR → ko
 * Falls back to English if no match.
 */
export function resolveSystemLanguage(tag: string | null | undefined): LanguageId {
  if (!tag) return 'en';
  const lower = tag.toLowerCase().replace('_', '-');
  if (lower.startsWith('zh')) {
    // Treat anything implying Mainland / Singapore Simplified as zh-Hans,
    // and TW / HK / explicit Hant as zh-Hant. Bare `zh` is ambiguous —
    // default to Traditional since that's the project's primary Chinese.
    if (lower.includes('hans') || lower.includes('cn') || lower.includes('sg')) return 'zh-Hans';
    if (
      lower.includes('hant') ||
      lower.includes('tw') ||
      lower.includes('hk') ||
      lower.includes('mo')
    )
      return 'zh-Hant';
    return 'zh-Hant';
  }
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('ko')) return 'ko';
  if (lower.startsWith('en')) return 'en';
  return 'en';
}

/**
 * Returns the localized string for `key` under `lang`, applying the resolution
 * order documented at the top of this file. Pure function — safe to call from
 * a snapshot test or a non-React context.
 */
export function translate(
  lang: LanguageId,
  key: TranslationKey | string,
  values?: TranslationValues
): string {
  const direct = getByPath(CATALOGS[lang], key);
  if (direct != null) return interpolate(direct, values);

  // zh-Hans inherits from zh-Hant via OpenCC simplification — most of the
  // catalog will Just Work without the contributor restating identical
  // sentences.
  if (lang === 'zh-Hans') {
    const fromTrad = getByPath(CATALOGS['zh-Hant'], key);
    if (fromTrad != null) return interpolate(toSimplified(fromTrad), values);
  }
  // Symmetric: a partial zh-Hant catalog can borrow phrases from zh-Hans.
  if (lang === 'zh-Hant') {
    const fromSimp = getByPath(CATALOGS['zh-Hans'], key);
    if (fromSimp != null) return interpolate(toTraditional(fromSimp), values);
  }

  const englishValue = getByPath(en, key);
  if (englishValue != null) {
    if (__DEV__ && lang !== 'en') {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] missing "${key}" in ${lang} — falling back to English`);
    }
    return interpolate(englishValue, values);
  }

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[i18n] unknown key "${key}"`);
  }
  return String(key);
}

// Re-export to keep imports tight.
export type { LanguageId, LanguageMeta, TranslationKey, TranslationValues } from './types';
