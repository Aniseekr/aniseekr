/**
 * Anime season helpers. Mirrors the Swift season detection used by AniList
 * and Jikan data sources.
 *
 * Conventions:
 * - Months are 1-indexed (1..12) to match `Date.getMonth() + 1` ergonomics.
 * - Season strings are upper-case to match AniList's `MediaSeason` enum.
 */
export type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export function getSeasonForMonth(month: number): Season {
  // 12, 1, 2 → WINTER
  // 3, 4, 5 → SPRING
  // 6, 7, 8 → SUMMER
  // 9, 10, 11 → FALL
  const m = ((((Math.floor(month) - 1) % 12) + 12) % 12) + 1;
  if (m === 12 || m <= 2) return 'WINTER';
  if (m <= 5) return 'SPRING';
  if (m <= 8) return 'SUMMER';
  return 'FALL';
}

export function getCurrentYear(now: Date = new Date()): number {
  return now.getFullYear();
}

export function getCurrentSeason(now: Date = new Date()): Season {
  return getSeasonForMonth(now.getMonth() + 1);
}

/** Broadcast cours: Jan–Mar / Apr–Jun / Jul–Sep / Oct–Dec, in local time. */
export function getBroadcastSeason(now = new Date()): { season: Season; year: number } {
  const seasons: Season[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  return { season: seasons[Math.floor(now.getMonth() / 3)], year: now.getFullYear() };
}

export type SeasonPhase = 'past' | 'current' | 'upcoming';

/** Where a season sits relative to the current broadcast cour. */
export function getSeasonPhase(
  selection: { season: Season; year: number },
  now = new Date()
): SeasonPhase {
  const order: Season[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  const current = getBroadcastSeason(now);
  const index = (s: { season: Season; year: number }) => s.year * 4 + order.indexOf(s.season);
  const diff = index(selection) - index(current);
  return diff < 0 ? 'past' : diff === 0 ? 'current' : 'upcoming';
}
