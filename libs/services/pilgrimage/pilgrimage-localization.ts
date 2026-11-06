import { getAppLanguageSync } from '../../i18n/app-language';
import { getEffectiveTitleOrderSync, type TitleLanguageId } from '../../i18n/title-language';
import { chineseScriptFor } from '../../utils/anime-localization-service';
import { toTraditional } from '../../utils/chinese-converter';
import type { PilgrimageSpot, PilgrimageWork } from './types';

export interface PilgrimageAnimeTitleInput {
  bangumiId?: number;
  title?: string | null;
  titleJa?: string | null;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
  titleZh?: { hans?: string | null; hant?: string | null } | null;
  ja?: string;
  en?: string | null;
  zh?: { hans?: string | null; hant?: string | null } | null;
}

export interface PilgrimageDisplayTitles {
  primary: string;
  secondary?: string;
  tertiary?: string;
  english?: string;
  romaji?: string;
  original?: string;
  chinese?: string;
}

export interface PilgrimageTitleOptions {
  /** Injectable for tests; defaults to the active app language. */
  appLanguage?: string;
}

export function getPilgrimageAnimeTitles(
  anime: PilgrimageAnimeTitleInput,
  options: PilgrimageTitleOptions = {}
): PilgrimageDisplayTitles {
  const appLanguage = options.appLanguage ?? getAppLanguageSync();

  const english = firstNonEmpty(anime.titleEnglish, anime.en);
  const romaji = firstNonEmpty(anime.titleRomaji);
  const original = firstNonEmpty(anime.titleJa, anime.ja, anime.title);
  const chineseCandidates = [
    anime.titleZh?.hant,
    anime.titleZh?.hans,
    anime.zh?.hant,
    anime.zh?.hans,
  ];
  const rawChinese = firstNonEmpty(
    ...(appLanguage.toLowerCase().startsWith('zh')
      ? chineseCandidates.filter(hasHanCharacters)
      : chineseCandidates)
  );
  // Convert Simplified Atlas titles for zh-Hant users.
  const chinese =
    rawChinese && chineseScriptFor(appLanguage) === 'hant' ? toTraditional(rawChinese) : rawChinese;

  // Candidates walk the user's title-language priority (custom order, or
  // derived from the app language) — the same order every other screen
  // renders with, instead of the old hardcoded english-first chain.
  const byLanguage: Record<TitleLanguageId, string | null> = {
    english,
    romaji,
    japanese: original,
    chinese,
    russian: null,
  };
  const ranked = getEffectiveTitleOrderSync(appLanguage).map((lang) => byLanguage[lang]);
  const primary = firstNonEmpty(...ranked, english, original, chinese, romaji) ?? '';
  const supporting = distinctTitles(primary, ...ranked, english, original, chinese, romaji);

  return {
    primary,
    secondary: supporting[0],
    tertiary: supporting[1],
    english: english ?? undefined,
    romaji: romaji ?? undefined,
    original: original ?? undefined,
    chinese: chinese ?? undefined,
  };
}

export function getPilgrimageAnimeWorkTitles(work: PilgrimageWork): PilgrimageDisplayTitles {
  return getPilgrimageAnimeTitles(work);
}

export function getPilgrimageSpotTitles(spot: PilgrimageSpot): PilgrimageDisplayTitles {
  const original = firstNonEmpty(spot.name);
  const secondary = firstNonEmpty(spot.address);
  const primary = original ?? '';
  const supporting = distinctTitles(primary, secondary);

  return {
    primary,
    secondary: supporting[0],
    original: original ?? undefined,
    chinese: undefined,
  };
}

export function formatPilgrimageSubtitle(titles: PilgrimageDisplayTitles): string | undefined {
  const parts = [titles.secondary, titles.tertiary].filter(
    (part): part is string => typeof part === 'string' && part.length > 0
  );
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const trimmed = toNonEmptyString(value);
    if (trimmed) return trimmed;
  }
  return null;
}

function distinctTitles(primary: string, ...values: unknown[]): string[] {
  const normalizedPrimary = normalizeForCompare(primary);
  const seen = new Set([normalizedPrimary]);
  const out: string[] = [];
  for (const value of values) {
    const trimmed = toNonEmptyString(value);
    if (!trimmed) continue;
    const normalized = normalizeForCompare(trimmed);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(trimmed);
  }
  return out;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasHanCharacters(value: unknown): boolean {
  return typeof value === 'string' && /\p{Script=Han}/u.test(value);
}

function normalizeForCompare(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}
