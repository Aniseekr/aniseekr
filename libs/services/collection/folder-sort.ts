import { kvGet, kvSet } from '../storage/app-storage';
import { COLLECTION_FOLDER_SORT_MODE_STORAGE_KEY } from '../storage/keys';
import { Logger } from '../../utils/logger';
import { normalizeTitleKey } from '../pilgrimage/bangumi-title-match';

export type FolderSortMode = 'added' | 'updated' | 'title' | 'rating';

/** Order here drives the on-screen chip order. */
export const FOLDER_SORT_MODES: FolderSortMode[] = ['added', 'updated', 'title', 'rating'];

export interface SortableFolderItem {
  title: string;
  /** Stored score (0–100, i.e. display rating × 10). */
  score: number;
  updated_at: number | null;
}

/**
 * Sort a folder's items. `'added'` preserves the DB order that
 * `getFolderItems` already applied (added_at DESC for custom folders,
 * updated_at DESC for system folders) — so we return a shallow copy without
 * touching order. The other modes sort a copy (never the caller's array).
 * Array.prototype.sort is stable in Hermes/V8, so equal keys keep DB order.
 */
export function sortFolderItems<T extends SortableFolderItem>(
  items: readonly T[],
  mode: FolderSortMode
): T[] {
  const copy = [...items];
  if (mode === 'added') return copy;
  copy.sort((a, b) => {
    if (mode === 'title') return a.title.localeCompare(b.title);
    if (mode === 'rating') return b.score - a.score;
    // 'updated' — missing timestamps sort last.
    return (b.updated_at ?? 0) - (a.updated_at ?? 0);
  });
  return copy;
}

/** Match stored and localized titles exactly as the visible title does. */
export function matchesTitleQuery(
  storedTitle: string,
  localizedTitle: string | null | undefined,
  query: string
): boolean {
  const normalizedQuery = normalizeTitleKey(query);
  if (!normalizedQuery) return true;
  return [storedTitle, localizedTitle].some((title) =>
    normalizeTitleKey(title ?? '').includes(normalizedQuery)
  );
}

export function filterFolderItems<T extends { title: string }>(
  items: readonly T[],
  query: string,
  getLocalizedTitle?: (item: T) => string | null | undefined
): T[] {
  return items.filter((item) => matchesTitleQuery(item.title, getLocalizedTitle?.(item), query));
}

/** Synchronous MMKV read — safe for first-frame `useState` initialisers. */
export function loadFolderSortModeSync(): FolderSortMode {
  try {
    const raw = kvGet(COLLECTION_FOLDER_SORT_MODE_STORAGE_KEY);
    if (raw && (FOLDER_SORT_MODES as string[]).includes(raw)) {
      return raw as FolderSortMode;
    }
    return 'added';
  } catch (err) {
    Logger.warn('[FolderSort] load failed, using default', err);
    return 'added';
  }
}

export function saveFolderSortMode(mode: FolderSortMode): void {
  try {
    kvSet(COLLECTION_FOLDER_SORT_MODE_STORAGE_KEY, mode);
  } catch (err) {
    Logger.warn('[FolderSort] save failed', err);
  }
}
