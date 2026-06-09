import type { CollectionPilgrimageEntry } from './collection-pilgrimage-service';
import type { AnitabiBangumi } from './types';

export interface PilgrimageCollectionState {
  collectionAnimes: AnitabiBangumi[];
  collectionIds: Set<number>;
}

export interface PilgrimageCollectionRefresh extends PilgrimageCollectionState {
  mergedAnimes: AnitabiBangumi[];
}

export function buildPilgrimageCollectionState(
  entries: readonly CollectionPilgrimageEntry[]
): PilgrimageCollectionState {
  const byId = new Map<number, AnitabiBangumi>();
  for (const entry of entries) {
    if (!byId.has(entry.anime.id)) byId.set(entry.anime.id, entry.anime);
  }
  const collectionAnimes = [...byId.values()].sort(
    (a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0)
  );
  return {
    collectionAnimes,
    collectionIds: new Set(collectionAnimes.map((anime) => anime.id)),
  };
}

export function mergePilgrimageAnimeList(
  current: readonly AnitabiBangumi[],
  incoming: readonly AnitabiBangumi[]
): AnitabiBangumi[] {
  if (incoming.length === 0) return current as AnitabiBangumi[];
  const merged = new Map(current.map((anime) => [anime.id, anime] as const));
  let changed = false;
  for (const anime of incoming) {
    if (merged.get(anime.id) === anime) continue;
    merged.set(anime.id, anime);
    changed = true;
  }
  if (!changed) return current as AnitabiBangumi[];
  return [...merged.values()].sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0));
}

export function applyPilgrimageCollectionEntries(
  currentAnimes: readonly AnitabiBangumi[],
  entries: readonly CollectionPilgrimageEntry[]
): PilgrimageCollectionRefresh {
  const state = buildPilgrimageCollectionState(entries);
  return {
    ...state,
    mergedAnimes: mergePilgrimageAnimeList(currentAnimes, state.collectionAnimes),
  };
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
