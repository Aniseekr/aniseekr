// Two-layer cache for the rating screen's swipe deck.
//
// Hot layer:   in-memory Map (insertion-order LRU, max 10 genres). Reads and
//              writes are synchronous so navigating back into a genre paints
//              the deck on the same frame.
// Cold layer:  `deck_state` row per genre, written through a 500ms debounce.
//              Survives app restart so a user who closed the app yesterday
//              resumes mid-deck instead of re-loading from AniList.
//
// TTL is 24h from `updatedAt`. Past that we treat the deck as stale (AniList
// may have rotated content) and force a fresh fetch.

import type { DeckItem, Photo } from '../../../components/rate/types';
import type { SwipeMode } from '../user-prefs';
import { LocalDB } from '../../db';

export interface DeckSnapshot {
  photos: Photo[];
  deck: DeckItem[];
  currentIndex: number;
  currentPage: number;
  hasMore: boolean;
  mode: SwipeMode;
  updatedAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 500;
const MAX_IN_MEMORY = 10;

const cache = new Map<string, DeckSnapshot>();
const pendingFlush = new Map<string, ReturnType<typeof setTimeout>>();

async function flushSnapshot(genreId: string, snapshot: DeckSnapshot): Promise<void> {
  try {
    await LocalDB.setDeckState({
      genre_id: genreId,
      photos_json: JSON.stringify(snapshot.photos),
      deck_json: JSON.stringify(snapshot.deck),
      current_index: snapshot.currentIndex,
      current_page: snapshot.currentPage,
      has_more: snapshot.hasMore ? 1 : 0,
      mode: snapshot.mode,
      updated_at: snapshot.updatedAt,
    });
  } catch (err) {
    console.warn('[deck-cache] flush failed', err);
  }
}

function touchLru(genreId: string, snapshot: DeckSnapshot): void {
  cache.delete(genreId);
  cache.set(genreId, snapshot);
  while (cache.size > MAX_IN_MEMORY) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const victim = cache.get(oldest);
    cache.delete(oldest);
    const handle = pendingFlush.get(oldest);
    if (handle) {
      clearTimeout(handle);
      pendingFlush.delete(oldest);
    }
    // Drain the latest in-memory snapshot for the evictee before dropping it,
    // otherwise a pending debounce would be silently lost and on-disk state
    // would lag behind the user's last action in that genre.
    if (victim) void flushSnapshot(oldest, victim);
  }
}

async function flush(genreId: string): Promise<void> {
  const snapshot = cache.get(genreId);
  if (!snapshot) return;
  await flushSnapshot(genreId, snapshot);
}

function scheduleFlush(genreId: string): void {
  const existing = pendingFlush.get(genreId);
  if (existing) clearTimeout(existing);
  const handle = setTimeout(() => {
    pendingFlush.delete(genreId);
    void flush(genreId);
  }, DEBOUNCE_MS);
  pendingFlush.set(genreId, handle);
}

export async function getDeck(genreId: string): Promise<DeckSnapshot | null> {
  const hot = cache.get(genreId);
  if (hot) {
    if (Date.now() - hot.updatedAt > TTL_MS) {
      cache.delete(genreId);
      const handle = pendingFlush.get(genreId);
      if (handle) {
        clearTimeout(handle);
        pendingFlush.delete(genreId);
      }
      void LocalDB.deleteDeckState(genreId).catch(() => {});
      return null;
    }
    touchLru(genreId, hot);
    return hot;
  }

  try {
    const row = await LocalDB.getDeckState(genreId);
    if (!row) return null;
    if (Date.now() - row.updated_at > TTL_MS) {
      await LocalDB.deleteDeckState(genreId);
      return null;
    }
    const snapshot: DeckSnapshot = {
      photos: JSON.parse(row.photos_json) as Photo[],
      deck: JSON.parse(row.deck_json) as DeckItem[],
      currentIndex: row.current_index,
      currentPage: row.current_page,
      hasMore: row.has_more === 1,
      mode: row.mode as SwipeMode,
      updatedAt: row.updated_at,
    };
    touchLru(genreId, snapshot);
    return snapshot;
  } catch (err) {
    console.warn('[deck-cache] getDeck failed', err);
    return null;
  }
}

export function putDeck(genreId: string, snapshot: DeckSnapshot): void {
  touchLru(genreId, snapshot);
  scheduleFlush(genreId);
}

export async function clearDeck(genreId: string): Promise<void> {
  cache.delete(genreId);
  const handle = pendingFlush.get(genreId);
  if (handle) {
    clearTimeout(handle);
    pendingFlush.delete(genreId);
  }
  try {
    await LocalDB.deleteDeckState(genreId);
  } catch (err) {
    console.warn('[deck-cache] clearDeck failed', err);
  }
}

export async function clearAllDecks(): Promise<void> {
  cache.clear();
  for (const handle of pendingFlush.values()) clearTimeout(handle);
  pendingFlush.clear();
  try {
    await LocalDB.clearAllDeckStates();
  } catch (err) {
    console.warn('[deck-cache] clearAllDecks failed', err);
  }
}
