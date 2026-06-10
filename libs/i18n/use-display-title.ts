// Display-title resolution for anime UI.
//
// `useAnimeDisplayTitle` is THE way a screen turns an anime record into the
// title string the user should see. It combines, reactively:
//   - the title-language priority order (custom, or derived from app language)
//   - the app UI language (drives the default order + Chinese script)
//   - the multilingual fields already on the item (AniList en/romaji/native,
//     Bangumi name_cn, Shikimori russian)
//   - the title-localization enrichment cache (Bangumi/Shikimori lookups via
//     the cross-platform ID mapping), kicking a fetch when the top-priority
//     language is still unknown.
//
// While an enrichment fetch is in flight the hook returns the best available
// fallback (per CLAUDE.md Rule 8: a real value or a real fallback — never an
// invented one); the subscription re-renders the component when the
// localized title lands.

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { PlatformType } from '../services/auth/types';
import {
  titleLocalizationService,
  type LocalizedTitleLanguage,
} from '../services/title-localization-service';
import {
  chineseScriptFor,
  resolveTitleByOrder,
  titleForLanguage,
  type AnimeTitleBundle,
  type ChineseScript,
} from '../utils/anime-localization-service';
import { useI18n } from './index';
import {
  getEffectiveTitleOrderSync,
  getStoredTitleOrderRawSync,
  subscribeTitleOrder,
  type TitleLanguageId,
} from './title-language';

export interface DisplayTitleSource extends AnimeTitleBundle {
  /** Platform ID; enables enrichment lookups. Omit for ID-less records. */
  id?: string | null;
}

const ENRICHABLE: ReadonlySet<TitleLanguageId> = new Set<TitleLanguageId>(['chinese', 'russian']);

/** Overlay enrichment-cache titles onto the item's own bundle. */
function withEnrichment(
  anime: DisplayTitleSource,
  platform: PlatformType
): AnimeTitleBundle {
  const id = anime.id;
  if (!id) return anime;
  let out: AnimeTitleBundle = anime;
  if (!anime.titleChinese && !anime.titleChineseTraditional) {
    const zh = titleLocalizationService.getSync('chinese', platform, id);
    if (zh) out = { ...out, titleChinese: zh };
  }
  if (!anime.titleRussian) {
    const ru = titleLocalizationService.getSync('russian', platform, id);
    if (ru) out = { ...out, titleRussian: ru };
  }
  return out;
}

/**
 * Request enrichment for the highest-priority language that is neither on the
 * item nor resolved in the cache yet. Stops at the first language that can
 * already render (no point fetching lower-priority titles), and skips
 * languages with a cached negative result.
 */
function kickEnrichment(
  anime: DisplayTitleSource,
  platform: PlatformType,
  order: readonly TitleLanguageId[],
  script: ChineseScript
): void {
  const id = anime.id;
  if (!id) return;
  for (const lang of order) {
    if (titleForLanguage(anime, lang, script)) return;
    if (!ENRICHABLE.has(lang)) continue;
    const cached = titleLocalizationService.getSync(lang as LocalizedTitleLanguage, platform, id);
    if (cached) return;
    if (cached === undefined) {
      titleLocalizationService.ensure(lang as LocalizedTitleLanguage, platform, id);
      return;
    }
    // cached === null → known-absent, keep walking down the order.
  }
}

/** Non-hook resolver for imperative call sites (share sheets, notifications). */
export function resolveDisplayTitleSync(
  anime: DisplayTitleSource,
  appLanguage: string,
  platform: PlatformType = 'anilist'
): string {
  const order = getEffectiveTitleOrderSync(appLanguage);
  return resolveTitleByOrder(withEnrichment(anime, platform), order, chineseScriptFor(appLanguage));
}

/**
 * The localized display title for an anime record, re-rendering when the
 * user's language/priority settings change or an enrichment fetch completes.
 *
 * @param platform ID space of `anime.id`. The legacy facade (trending,
 *                 search, detail, collection favorites) is AniList-backed,
 *                 hence the default.
 */
export function useAnimeDisplayTitle(
  anime: DisplayTitleSource | null | undefined,
  platform: PlatformType = 'anilist'
): string {
  const { language } = useI18n();

  const storedOrderRaw = useSyncExternalStore(subscribeTitleOrder, getStoredTitleOrderRawSync);

  const subscribeEnrichment = useCallback(
    (onChange: () => void) => titleLocalizationService.subscribe(onChange),
    []
  );
  const getSnapshot = useCallback(() => {
    if (!anime) return '';
    // storedOrderRaw is consumed via getEffectiveTitleOrderSync; listing it as
    // a dep refreshes the snapshot when the user reorders languages.
    void storedOrderRaw;
    const order = getEffectiveTitleOrderSync(language);
    return resolveTitleByOrder(withEnrichment(anime, platform), order, chineseScriptFor(language));
  }, [anime, platform, language, storedOrderRaw]);

  const title = useSyncExternalStore(subscribeEnrichment, getSnapshot);

  useEffect(() => {
    if (!anime?.id) return;
    const kick = () =>
      kickEnrichment(
        anime,
        platform,
        getEffectiveTitleOrderSync(language),
        chineseScriptFor(language)
      );
    kick();
    // Re-kick on every cache landing: when the top language resolves to a
    // negative result, the next enrichable language down the order gets its
    // turn (e.g. chinese → null, now fetch russian). kickEnrichment is
    // idempotent and stops at the first renderable language, so this settles.
    return titleLocalizationService.subscribe(kick);
  }, [anime, platform, language, storedOrderRaw]);

  return title || (anime?.title ?? '');
}
