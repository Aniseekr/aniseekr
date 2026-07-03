// Honest "my pilgrimage" progress for a hub collection card (CLAUDE.md Rule 8).
// visitedCount = the anime's known points that are checked in. total is the
// denominator ONLY when we hold that anime's cached detail points — litePoints
// is a sample, so it must never masquerade as the true count.
import type { AnitabiBangumi } from './types';
import type { VisitedMap } from './visited-prefs';

export function resolveHubAnimeProgress(
  anime: AnitabiBangumi,
  visited: VisitedMap,
  cachedDetailPointIds?: readonly string[] | null
): { visitedCount: number; total: number | null } {
  let visitedCount = 0;
  for (const p of anime.litePoints ?? []) {
    if (visited[p.id]) visitedCount += 1;
  }
  const total = cachedDetailPointIds && cachedDetailPointIds.length > 0 ? cachedDetailPointIds.length : null;
  return { visitedCount, total };
}
