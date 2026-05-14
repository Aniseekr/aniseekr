import { lookupByBangumiId, type AnitabiCrossIndexEntry } from './anitabi-cross-index';
import type { AnitabiPoint } from './types';

export interface PilgrimageAnimeTitleInput {
  id?: number;
  bangumiId?: number;
  title?: string | null;
  cn?: string | null;
  titleJa?: string | null;
  titleCn?: string | null;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
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
  lookupCrossIndex?: (bangumiId: number) => AnitabiCrossIndexEntry | null;
}

export function getPilgrimageAnimeTitles(
  anime: PilgrimageAnimeTitleInput,
  options: PilgrimageTitleOptions = {}
): PilgrimageDisplayTitles {
  const bangumiId = anime.bangumiId ?? anime.id;
  const cross =
    typeof bangumiId === 'number'
      ? (options.lookupCrossIndex ?? lookupByBangumiId)(bangumiId)
      : null;

  const english = firstNonEmpty(anime.titleEnglish, cross?.titleEnglish);
  const romaji = firstNonEmpty(anime.titleRomaji, cross?.titleRomaji);
  const original = firstNonEmpty(anime.titleJa, anime.title, cross?.titleJa);
  const chinese = firstNonEmpty(anime.titleCn, anime.cn, cross?.titleCn);
  const primary = firstNonEmpty(english, original, chinese, romaji, 'Unknown Title')!;
  const supporting = distinctTitles(primary, original, chinese, romaji, english);

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

export function getPilgrimageSpotTitles(spot: AnitabiPoint): PilgrimageDisplayTitles {
  const original = firstNonEmpty(spot.name);
  const chinese = firstNonEmpty(spot.cn);
  const primary = firstNonEmpty(original, chinese, `EP ${spot.ep}`)!;
  const supporting = distinctTitles(primary, chinese);

  return {
    primary,
    secondary: supporting[0],
    original: original ?? undefined,
    chinese: chinese ?? undefined,
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

function normalizeForCompare(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}
