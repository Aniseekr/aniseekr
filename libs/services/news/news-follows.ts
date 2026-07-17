import { kvGet, kvSet } from '../storage/app-storage';
import { NEWS_FOLLOWS_STORAGE_KEY } from '../storage/keys';
import { getAllNewsSources, getRecommendedSourceIds } from './news-sources';

const listeners = new Set<() => void>();
let version = 0;

/**
 * Monotonic counter bumped on every follow-set write. Consumers fold this
 * into a `useSyncExternalStore` snapshot so a follow/unfollow reactively
 * re-derives — the follow set is stored in MMKV, not React state, so without
 * a changing version the store would notify but the snapshot value wouldn't
 * change and React would bail out of the re-render.
 */
export function getNewsFollowsVersion(): number {
  return version;
}

export function followSource(ids: readonly string[], id: string): string[] {
  return normalizeSet([...ids, id]);
}

export function unfollowSource(ids: readonly string[], id: string): string[] {
  return normalizeSet(ids.filter((candidate) => candidate !== id));
}

export function loadFollowedSourceIdsSync(): string[] {
  const raw = kvGet(NEWS_FOLLOWS_STORAGE_KEY);
  if (raw === null) return [...getRecommendedSourceIds()];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeIds(parsed);
  } catch {
    return [...getRecommendedSourceIds()];
  }
}

export function saveFollowedSourceIds(ids: readonly string[]): void {
  kvSet(NEWS_FOLLOWS_STORAGE_KEY, JSON.stringify(sanitizeIds(ids)));
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeNewsFollows(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function sanitizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(getAllNewsSources().map((source) => source.id));
  return normalizeSet(value.filter((id): id is string => typeof id === 'string' && known.has(id)));
}

function normalizeSet(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
