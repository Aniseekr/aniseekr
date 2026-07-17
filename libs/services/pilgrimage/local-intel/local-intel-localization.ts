// LocalizedText resolution (spec §13). Mirrors pilgrimage-localization's
// conventions: the user's app language drives priority, zh-Hans converts to
// Traditional via OpenCC, and every resolved value is tagged with an honest
// TranslationSource — a fallback is never presented as a native translation.

import { getAppLanguageSync } from '../../../i18n/app-language';
import type { TranslatedValue } from '../../../i18n/data-translator';
import { toTraditional } from '../../../utils/chinese-converter';
import type { LocalizedText } from './types';

function nonEmpty(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveLocalIntelText(
  text: LocalizedText,
  appLanguage: string = getAppLanguageSync(),
): TranslatedValue {
  const lang = (appLanguage || '').toLowerCase();
  const ja = nonEmpty(text.ja);
  const en = nonEmpty(text.en);
  const zhHant = nonEmpty(text.zhHant);
  const zhHans = nonEmpty(text.zhHans);

  if (lang.startsWith('ja') && ja) return { value: ja, source: 'native' };

  if (lang.startsWith('zh-hant') || lang === 'zh-tw' || lang === 'zh-hk') {
    if (zhHant) return { value: zhHant, source: 'native' };
    if (zhHans) return { value: toTraditional(zhHans), source: 'curated' };
    return honestFallback(ja, en);
  }

  if (lang.startsWith('zh')) {
    if (zhHans) return { value: zhHans, source: 'native' };
    if (zhHant) return { value: zhHant, source: 'curated' };
    return honestFallback(ja, en);
  }

  if (lang.startsWith('en') && en) return { value: en, source: 'native' };

  // Everything else (ko, partial locales, unknown): English before Japanese.
  const fallback = en ?? ja ?? zhHant ?? zhHans ?? '';
  return { value: fallback, source: 'original' };
}

/** Chinese users read kanji: Japanese beats English as the fallback. */
function honestFallback(ja: string | null, en: string | null): TranslatedValue {
  return { value: ja ?? en ?? '', source: 'original' };
}
