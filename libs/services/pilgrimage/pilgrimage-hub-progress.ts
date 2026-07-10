// Honest "my pilgrimage" progress for a hub collection card (CLAUDE.md Rule 8).
// visitedCount = the anime's known points that are checked in. total is the
// denominator ONLY when we hold that anime's full per-anime points list —
// litePoints is a sample, so it must never masquerade as the true count.
//
// When the full list is present, BOTH numerator and denominator are computed
// against it — litePoints ids never contribute to the numerator once a full
// list exists, so a stale/sample id that isn't actually in the real list
// can't inflate the count (honesty case: a visited id from litePoints that
// is missing from fullPoints does not count).
import type { AnitabiBangumi } from './types';
import type { VisitedMap } from './visited-prefs';

export function resolveHubAnimeProgress(
  anime: AnitabiBangumi,
  visited: VisitedMap,
  fullPoints?: readonly { id: string }[] | null
): { visitedCount: number; total: number | null } {
  if (fullPoints && fullPoints.length > 0) {
    let visitedCount = 0;
    for (const p of fullPoints) {
      if (visited[p.id]) visitedCount += 1;
    }
    return { visitedCount, total: fullPoints.length };
  }
  let visitedCount = 0;
  for (const p of anime.litePoints ?? []) {
    if (visited[p.id]) visitedCount += 1;
  }
  return { visitedCount, total: null };
}
