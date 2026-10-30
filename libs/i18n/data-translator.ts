import genreDictionary from './data/genres.json';
import type { LanguageId } from './types';

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

// ── Curated genre dictionary (layer 2) ───────────────────────────────────────

type GenreEntry = Partial<Record<LanguageId, string>>;

const GENRES: Record<string, GenreEntry> = Object.fromEntries(
  Object.entries(genreDictionary).filter(([key]) => !key.startsWith('$'))
) as Record<string, GenreEntry>;

// Case-insensitive index: sources disagree on casing ("Slice of life" vs
// "Slice of Life"), the dictionary keys are canonical Title Case.
const GENRE_INDEX = new Map(Object.keys(GENRES).map((key) => [key.toLowerCase(), key]));

/**
 * Translate an API genre name into the UI language. English UI keeps the
 * canonical name (`native`); a dictionary hit is `curated`; anything the
 * dictionary doesn't cover is returned unchanged as `original` — never guessed.
 */
export function translateGenre(genre: string, language: LanguageId): TranslatedValue {
  if (language === 'en') return { value: genre, source: 'native' };
  const key = GENRE_INDEX.get(genre.trim().toLowerCase());
  const translated = key ? GENRES[key]?.[language] : undefined;
  return translated
    ? { value: translated, source: 'curated' }
    : { value: genre, source: 'original' };
}
