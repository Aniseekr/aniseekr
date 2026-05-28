// Runtime data translation — distinct from UI catalog.
//
// UI catalog (`useT`) translates fixed app chrome. This file translates values
// that arrived from an API: genres, tags, studios, synopsis text, episode
// titles. The values aren't known at build time, so we can't put them in
// `en.json` — instead we layer:
//
//   1. Source-provided localized fields (caller resolves this BEFORE we run)
//   2. Curated dictionary  ← P1: genres only; P2: tags + studios
//   3. On-device MT        ← P3: Apple Translate (iOS) + ML Kit (Android)
//   4. Original text       ← always available fallback
//
// Every public function returns `{ value, source }` so callers can render a
// machine-translation badge when `source === 'mt'`. Sources earlier in the
// chain are preferred — UI never lies about whether a translation is human-
// curated or machine-generated.

import { useMemo } from 'react';
import { useI18n } from './index';
import genresDict from './data/genres.json';
import { getVocabLanguageSync } from './data-language-prefs';
import type { LanguageId } from './types';

/** Where a translated value came from. UI uses this to badge MT outputs. */
export type TranslationSource =
  | 'native' // already in the target language when we got it
  | 'curated' // hit in our shipped dictionary
  | 'mt' // produced by an on-device machine translator (P3+)
  | 'original'; // unchanged — no translation available

export interface TranslatedValue {
  value: string;
  source: TranslationSource;
}

type GenreDict = Record<string, Partial<Record<LanguageId, string>>>;
const GENRES = genresDict as unknown as GenreDict;

/**
 * Resolve a genre to the requested language using only the curated dict.
 * No MT, no network — purely a lookup. English is the canonical key, so the
 * caller passes the English genre verbatim (that's what AniList / MAL emit).
 */
export function translateGenre(englishGenre: string, lang: LanguageId): TranslatedValue {
  if (lang === 'en') return { value: englishGenre, source: 'original' };
  const entry = GENRES[englishGenre];
  const hit = entry?.[lang];
  if (hit) return { value: hit, source: 'curated' };
  return { value: englishGenre, source: 'original' };
}

/**
 * Stable order across languages. P1 keeps the API's order (no sort cost,
 * matches list-screen ordering) — callers wrap their genre list in this so
 * we can swap in alphabetical-by-English later without touching call sites.
 */
export function sortGenres(genres: string[]): string[] {
  return genres;
}

/**
 * Tags / studios / episode titles / synopsis — P1 placeholders. They return
 * the original verbatim with `source: 'original'`. P2 adds `tags.json` +
 * `studios.json` dicts, P3 adds MT engines. Call sites can already wire up
 * `<TranslatedText>` without checking which phase we're in.
 */
export function translateTag(text: string, _lang: LanguageId): TranslatedValue {
  return { value: text, source: 'original' };
}

export function translateStudio(text: string, _lang: LanguageId): TranslatedValue {
  return { value: text, source: 'original' };
}

export function translateSynopsis(text: string, _lang: LanguageId): TranslatedValue {
  return { value: text, source: 'original' };
}

export function translateEpisodeTitle(text: string, _lang: LanguageId): TranslatedValue {
  return { value: text, source: 'original' };
}

/**
 * Resolve the effective vocab language: explicit override (genre/tag picker
 * in Language settings) or the active app language.
 */
function resolveVocabLanguage(appLanguage: LanguageId): LanguageId {
  const pref = getVocabLanguageSync();
  if (pref === 'auto') return appLanguage;
  return pref;
}

/** Hook variant for components — picks the right target language automatically. */
export function useTranslatedGenre(englishGenre: string): TranslatedValue {
  const { language } = useI18n();
  return useMemo(
    () => translateGenre(englishGenre, resolveVocabLanguage(language)),
    [englishGenre, language]
  );
}

/** Batch helper — useful for a chip row. Preserves input order via `sortGenres`. */
export function useTranslatedGenres(englishGenres: string[]): TranslatedValue[] {
  const { language } = useI18n();
  return useMemo(() => {
    const target = resolveVocabLanguage(language);
    return sortGenres(englishGenres).map((g) => translateGenre(g, target));
  }, [englishGenres, language]);
}
