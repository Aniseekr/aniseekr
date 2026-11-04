import type { CollectionPilgrimageEntry } from './collection-pilgrimage-service';
import type { PilgrimageWork } from './types';

export interface PilgrimageCollectionState {
  collectionAnimes: PilgrimageWork[];
  collectionIds: Set<string>;
}

export function buildPilgrimageCollectionState(
  entries: readonly CollectionPilgrimageEntry[]
): PilgrimageCollectionState {
  const byId = new Map<string, PilgrimageWork>();
  for (const entry of entries) {
    if (!byId.has(entry.anime.key)) byId.set(entry.anime.key, entry.anime);
  }
  const collectionAnimes = [...byId.values()].sort(
    (a, b) => b.spots.length - a.spots.length
  );
  return {
    collectionAnimes,
    collectionIds: new Set(collectionAnimes.map((anime) => anime.key)),
  };
}

export function mergePilgrimageAnimeList(
  current: readonly PilgrimageWork[],
  incoming: readonly PilgrimageWork[]
): PilgrimageWork[] {
  if (incoming.length === 0) return current as PilgrimageWork[];
  const merged = new Map(current.map((anime) => [anime.key, anime] as const));
  let changed = false;
  for (const anime of incoming) {
    if (merged.get(anime.key) === anime) continue;
    merged.set(anime.key, anime);
    changed = true;
  }
  if (!changed) return current as PilgrimageWork[];
  return [...merged.values()].sort((a, b) => b.spots.length - a.spots.length);
}

export function shouldRefreshPilgrimageCollectionOnFocus({
  hasInitialCollection,
  hasSeenFocus,
}: {
  hasInitialCollection: boolean;
  hasSeenFocus: boolean;
}): boolean {
  return hasSeenFocus || hasInitialCollection;
}
