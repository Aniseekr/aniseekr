import type { TitleLanguageId } from '../i18n/title-language';
import type { UnifiedAnimeItem } from '../models/unified-anime-item';
import { toSimplified, toTraditional } from './chinese-converter';

/**
 * The multilingual title fields shared by `UnifiedAnimeItem` and the legacy
 * `Anime` shape. `title` is the canonical always-present fallback.
 */
export interface AnimeTitleBundle {
  title: string;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
  titleJapanese?: string | null;
  titleChinese?: string | null;
  titleChineseTraditional?: string | null;
  titleRussian?: string | null;
}

export type ChineseScript = 'hans' | 'hant';

/** Which Chinese script the user expects, derived from the app UI language. */
export function chineseScriptFor(appLanguage: string): ChineseScript {
  return (appLanguage || '').toLowerCase().startsWith('zh-hans') ? 'hans' : 'hant';
}

function nonEmpty(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

/**
 * The bundle's title for one language, or null when the bundle doesn't have
 * it. Chinese converts between scripts on the fly: Bangumi gives Simplified,
 * a zh-Hant user still gets Traditional (and vice versa).
 */
export function titleForLanguage(
  bundle: AnimeTitleBundle,
  lang: TitleLanguageId,
  script: ChineseScript
): string | null {
  switch (lang) {
    case 'english':
      return nonEmpty(bundle.titleEnglish);
    case 'romaji':
      return nonEmpty(bundle.titleRomaji);
    case 'japanese':
      return nonEmpty(bundle.titleJapanese);
    case 'russian':
      return nonEmpty(bundle.titleRussian);
    case 'chinese': {
      const simplified = nonEmpty(bundle.titleChinese);
      const traditional = nonEmpty(bundle.titleChineseTraditional);
      if (script === 'hans') {
        return simplified ?? (traditional ? toSimplified(traditional) : null);
      }
      return traditional ?? (simplified ? toTraditional(simplified) : null);
    }
  }
}

/**
 * Resolve the display title by walking the user's title-language priority
 * order. Falls back to the canonical `title` (never empty) when no preferred
 * language is available.
 */
export function resolveTitleByOrder(
  bundle: AnimeTitleBundle,
  order: readonly TitleLanguageId[],
  script: ChineseScript = 'hant'
): string {
  for (const lang of order) {
    const candidate = titleForLanguage(bundle, lang, script);
    if (candidate) return candidate;
  }
  return bundle.title;
}

/**
 * Resolve the best display title for the user's preferred language.
 *
 * Fallback chain:
 *   zh-Hans / zh-CN / zh                → titleChinese
 *                                       → toSimplified(titleChineseTraditional)
 *   zh-Hant / zh-TW / zh-HK             → titleChineseTraditional
 *                                       → toTraditional(titleChinese)
 *   ja / ja-JP                          → titleJapanese
 *   ru / ru-RU                          → titleRussian
 *   en / en-US / en-GB                  → titleEnglish
 *   *                                   → titleEnglish → titleRomaji → title
 *
 * When only one Chinese variant exists on the item, we OpenCC-convert it on
 * the fly so users always see their preferred script — Bangumi gives us
 * Simplified, but a `zh-Hant` user expects Traditional. Mirror behavior on
 * the rare reverse path.
 *
 * The function NEVER returns an empty string. As a last resort it returns
 * `item.title`, which is guaranteed by the constructor to be non-null.
 */
export function getDisplayTitle(item: UnifiedAnimeItem, lang: string): string {
  const normalized = (lang || '').toLowerCase().replace('_', '-');

  const candidates: (string | null)[] = [];

  if (normalized.startsWith('zh-hans') || normalized === 'zh-cn' || normalized === 'zh') {
    candidates.push(item.titleChinese);
    if (item.titleChineseTraditional && !item.titleChinese) {
      candidates.push(toSimplified(item.titleChineseTraditional));
    } else {
      candidates.push(item.titleChineseTraditional);
    }
  } else if (normalized.startsWith('zh-hant') || normalized === 'zh-tw' || normalized === 'zh-hk') {
    candidates.push(item.titleChineseTraditional);
    if (item.titleChinese && !item.titleChineseTraditional) {
      candidates.push(toTraditional(item.titleChinese));
    } else {
      candidates.push(item.titleChinese);
    }
  } else if (normalized.startsWith('ja')) {
    candidates.push(item.titleJapanese);
  } else if (normalized.startsWith('ru')) {
    candidates.push(item.titleRussian);
  } else if (normalized.startsWith('en')) {
    candidates.push(item.titleEnglish);
  }

  // Universal fallback chain after language-specific.
  candidates.push(item.titleEnglish, item.titleRomaji, item.title);

  for (const candidate of candidates) {
    if (candidate && candidate.length > 0) return candidate;
  }
  return item.title;
}
