// Persistent "not interested" skips for the bangumi card deck.
//
// Left-swiping a card marks the anime as skipped for that season. Skips are
// remembered across sessions so the triage deck converges — without this the
// same rejected shows resurface on every visit. Skips are scoped per
// season+year (a show skipped in Summer 2026 can still be triaged next
// season) and are always reversible via snackbar undo or the deck's
// empty-state restore action.
//
// MMKV-backed via kvGet/kvSet so reads are synchronous and safe in a
// `useState`/`useMemo` initializer (no frame-1 flash) — same pattern as
// `bangumi-prefs.ts`.

import { kvGet, kvSet } from '../storage/app-storage';
import { BANGUMI_SEASON_SKIPS_STORAGE_KEY } from '../storage/keys';
import { Logger } from '../../utils/logger';

export { BANGUMI_SEASON_SKIPS_STORAGE_KEY };

type SkipBlob = Record<string, string[]>;

function seasonKey(season: string, year: number): string {
  return `${season}_${year}`;
}

function loadBlob(): SkipBlob {
  try {
    const raw = kvGet(BANGUMI_SEASON_SKIPS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SkipBlob;
  } catch (err) {
    Logger.warn('[SeasonSkipStore] load failed, treating as empty', err);
    return {};
  }
}

function saveBlob(blob: SkipBlob): void {
  try {
    kvSet(BANGUMI_SEASON_SKIPS_STORAGE_KEY, JSON.stringify(blob));
  } catch (err) {
    Logger.warn('[SeasonSkipStore] save failed', err);
  }
}

/** Synchronous read of every skipped anime id for a season. */
export function loadSeasonSkipsSync(season: string, year: number): Set<string> {
  const ids = loadBlob()[seasonKey(season, year)];
  return new Set(Array.isArray(ids) ? ids : []);
}

/** Mark an anime as "not interested" for this season. Idempotent. */
export function addSeasonSkip(season: string, year: number, animeId: string): void {
  const blob = loadBlob();
  const key = seasonKey(season, year);
  const ids = new Set(blob[key] ?? []);
  if (ids.has(animeId)) return;
  ids.add(animeId);
  blob[key] = [...ids];
  saveBlob(blob);
}

/** Undo a single skip (snackbar undo). */
export function removeSeasonSkip(season: string, year: number, animeId: string): void {
  const blob = loadBlob();
  const key = seasonKey(season, year);
  const ids = blob[key];
  if (!ids?.includes(animeId)) return;
  blob[key] = ids.filter((id) => id !== animeId);
  if (blob[key].length === 0) delete blob[key];
  saveBlob(blob);
}

/** Restore every skipped anime for a season (deck empty-state action). */
export function clearSeasonSkips(season: string, year: number): void {
  const blob = loadBlob();
  const key = seasonKey(season, year);
  if (!(key in blob)) return;
  delete blob[key];
  saveBlob(blob);
}
