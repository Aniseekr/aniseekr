// Sort logic for the pilgrimage hub's "My Collection" rail (and, later, the
// See-all list). Kept as a pure, dependency-free helper so it's unit-testable
// without pulling expo-location into the test runtime, and so the screens stay
// view orchestrators (CLAUDE.md Rule 9).
//
// Every ordering is backed by real data (CLAUDE.md Rule 8): `distance` needs a
// real user fix (undefined per-anime when the location or the anime's geo is
// missing), `spots` is Anitabi's `pointsLength`, `title` is the displayed
// label. There is intentionally no "recently added" key — the collection comes
// from a SQL UNION with no timestamp, so any such order would be fabricated.

import type { AnitabiBangumi } from './types';

export type PilgrimageSortKey = 'distance' | 'spots' | 'title';

/** Nearest-first by default; collapses to `spots` when no location (see
 *  {@link resolveEffectivePilgrimageSortKey}). */
export const DEFAULT_PILGRIMAGE_SORT_KEY: PilgrimageSortKey = 'distance';

export interface SortPilgrimageOptions {
  /** Distance in km from the user to each anime's center; undefined when
   *  unknown (no location, or the anime has no valid geo). */
  distanceKmOf?: (anime: AnitabiBangumi) => number | undefined;
  /** Display title used for alphabetical sorting. Defaults to the Japanese
   *  title, falling back to the Chinese title. */
  getTitle?: (anime: AnitabiBangumi) => string;
}

function defaultTitle(anime: AnitabiBangumi): string {
  return anime.title || anime.cn || '';
}

function finiteDistance(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Sort keys to surface in the UI. `distance` is only meaningful with a fix. */
export function resolvePilgrimageSortKeys(hasLocation: boolean): PilgrimageSortKey[] {
  return hasLocation ? ['distance', 'spots', 'title'] : ['spots', 'title'];
}

/** The key actually applied — never show "Nearest" as active without a fix. */
export function resolveEffectivePilgrimageSortKey(
  key: PilgrimageSortKey,
  hasLocation: boolean
): PilgrimageSortKey {
  if (key === 'distance' && !hasLocation) return 'spots';
  return key;
}

/** Returns a new, sorted array — never mutates `animes`. */
export function sortPilgrimageAnimes(
  animes: readonly AnitabiBangumi[],
  key: PilgrimageSortKey,
  options: SortPilgrimageOptions = {}
): AnitabiBangumi[] {
  const getTitle = options.getTitle ?? defaultTitle;
  const distanceKmOf = options.distanceKmOf;

  const byTitle = (a: AnitabiBangumi, b: AnitabiBangumi) => getTitle(a).localeCompare(getTitle(b));
  const bySpots = (a: AnitabiBangumi, b: AnitabiBangumi) =>
    (b.pointsLength ?? 0) - (a.pointsLength ?? 0) || byTitle(a, b);

  const next = animes.slice();

  if (key === 'title') {
    next.sort(byTitle);
    return next;
  }
  if (key === 'spots') {
    next.sort(bySpots);
    return next;
  }

  // distance: known distances ascending, then everything with an unknown
  // distance ordered by spot count so the rail still reads sensibly.
  next.sort((a, b) => {
    const da = finiteDistance(distanceKmOf?.(a));
    const db = finiteDistance(distanceKmOf?.(b));
    if (da !== null && db !== null) return da - db || bySpots(a, b);
    if (da !== null) return -1;
    if (db !== null) return 1;
    return bySpots(a, b);
  });
  return next;
}
