// Anime-data language preferences.
//
// Separate from `APP_LANGUAGE_KEY` (which controls UI chrome) and from
// `LANGUAGE_PRIORITY_KEY` (which controls title language ordering). These
// three switches live together on the unified Language settings screen but
// each is owned by its own module so consumers can subscribe selectively.
//
// API mirrors the rest of the prefs surface: synchronous read for first-frame
// seeding, mutating setter, no React dependency. Components hold their own
// `useState(getXSync)` and call the setter directly — the same pattern as
// `ThemeContext` and `language-priority.tsx`. Cross-screen sync isn't needed
// in P1 because only the Language settings screen mutates these.

import { appStorage, kvGet, kvSet } from '../services/storage/app-storage';
import {
  ANIME_AUTOTRANSLATE_KEY,
  ANIME_SHOW_ORIGINAL_KEY,
  ANIME_VOCAB_LANG_KEY,
} from '../services/storage/keys';
import type { AppLanguagePreference } from './types';

const VOCAB_VALUES: AppLanguagePreference[] = ['auto', 'en', 'zh-Hant', 'zh-Hans', 'ja', 'ko'];

function parseVocab(raw: string | null): AppLanguagePreference {
  if (raw && (VOCAB_VALUES as string[]).includes(raw)) return raw as AppLanguagePreference;
  return 'auto';
}

export function getVocabLanguageSync(): AppLanguagePreference {
  return parseVocab(kvGet(ANIME_VOCAB_LANG_KEY));
}

export function setVocabLanguage(next: AppLanguagePreference): void {
  kvSet(ANIME_VOCAB_LANG_KEY, next);
}

export function getAutotranslateSync(): boolean {
  return appStorage.getBoolean(ANIME_AUTOTRANSLATE_KEY) ?? false;
}

export function setAutotranslate(next: boolean): void {
  appStorage.set(ANIME_AUTOTRANSLATE_KEY, next);
}

export function getShowOriginalSync(): boolean {
  return appStorage.getBoolean(ANIME_SHOW_ORIGINAL_KEY) ?? false;
}

export function setShowOriginal(next: boolean): void {
  appStorage.set(ANIME_SHOW_ORIGINAL_KEY, next);
}
