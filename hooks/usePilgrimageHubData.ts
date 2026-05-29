// Data cluster for the pilgrimage hub map (app/(tabs)/pilgrimage/map.tsx).
//
// Owns the "known anime" set and everything that feeds it: the synchronous
// snapshot/index seed (so the map + sheet render on frame 1, CLAUDE.md Rule
// 10), the collection + featured backfill, MMKV-seeded visited/capture state,
// and the bounds-/location-driven lazy loading from the offline anitabi index.
//
// Lifted out of the screen so the route file stays a view orchestrator rather
// than a state dumping ground (CLAUDE.md Rule 9). The screen passes in the
// route's `focus` bangumi id and the live `userLocation`; everything else is
// internal. View state (search/filter/layout/region/focused card and all the
// derived view memos + handlers) stays in the screen and consumes these
// outputs exactly where the old local state used to live.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pilgrimageRepository } from '../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../libs/services/pilgrimage/featured-anime';
import { collectionPilgrimageService } from '../libs/services/pilgrimage/collection-pilgrimage-service';
import type { LatLng } from '../libs/services/pilgrimage/location-service';
import type { AnitabiBangumi } from '../libs/services/pilgrimage/types';
import {
  getAnimeInBounds,
  type AnitabiIndexEntry,
  type BoundingBox,
} from '../libs/services/pilgrimage/anitabi-index';
import { getNearbyMapEntries } from '../libs/services/pilgrimage/map-nearby';
import { getPilgrimageHubSnapshot } from '../libs/services/pilgrimage/pilgrimage-hub-cache';
import {
  loadVisitedSpotsSync,
  type VisitedMap,
} from '../libs/services/pilgrimage/visited-prefs';
import { loadCapturesSync } from '../libs/services/pilgrimage/captures';
import {
  appendIndexedEntriesExcludingKnownAnimes,
  buildKnownAnimeIdSet,
  buildSeededPilgrimageAnimes,
  seedPilgrimageAnimeFromIndex,
} from '../libs/services/pilgrimage/pilgrimage-screen-state';
import { shouldLoadPilgrimageMapBounds } from '../libs/services/pilgrimage/pilgrimage-design-flow';

const COLLECTION_BACKFILL_TARGET = 16;
const FEATURED_PILGRIMAGE_IDS = FEATURED_PILGRIMAGE_ANIME.map(
  ({ bangumiId }) => bangumiId
);

// Max featured `/lite` fetches in flight at once. The hub fires one request per
// FEATURED_PILGRIMAGE_IDS entry on cold start; firing all ~29 at once is a
// request storm against api.anitabi.cn during the most contended moment of
// app launch. A small pool keeps the same batching/flush + cancellation
// behavior while bounding concurrency.
const FEATURED_FETCH_CONCURRENCY = 6;

function buildInitialMapSeedIds(focusBangumiId: number | null): number[] {
  if (focusBangumiId === null) return FEATURED_PILGRIMAGE_IDS;
  return [focusBangumiId, ...FEATURED_PILGRIMAGE_IDS];
}

function mergeAnimeList(
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

export interface UsePilgrimageHubDataParams {
  /** Bangumi id from the route's `focus` param (null when none). Seeds the
   *  initial known-anime list so the focused marker renders on frame 1. */
  focusBangumiId: number | null;
  /** Live user location from the tracking hook (null until a fix lands). Drives
   *  the nearby-index merge effect. */
  userLocation: LatLng | null;
}

export interface UsePilgrimageHubData {
  /** Collection + featured-backfilled animes (the canonical loaded set). */
  animes: AnitabiBangumi[];
  /** `animes` unioned with lazy index-derived entries — the full known set. */
  knownAnimes: AnitabiBangumi[];
  /** Bangumi ids present in the user's collection. */
  collectionIds: Set<number>;
  /** Lazy-loaded offline-index entries keyed by bangumi id (additive only). */
  extraIndexed: Map<number, AnitabiIndexEntry>;
  /** True only on a cold start with no seeded animes. */
  loading: boolean;
  /** Visited spot ids (MMKV-seeded on the first frame). */
  visited: VisitedMap;
  /** Count of photographed spots (MMKV-seeded on the first frame). */
  captureCount: number;
  /** Map-bounds callback: lazy-load index entries that fall into the viewport. */
  handleBoundsChange: (bounds: BoundingBox) => void;
}

export function usePilgrimageHubData({
  focusBangumiId,
  userLocation,
}: UsePilgrimageHubDataParams): UsePilgrimageHubData {
  const initialSeedAnimes = useMemo(
    () => buildSeededPilgrimageAnimes(buildInitialMapSeedIds(focusBangumiId)),
    [focusBangumiId]
  );
  const [initialSnapshot] = useState(() => getPilgrimageHubSnapshot());
  const hasInitialCollection = Object.prototype.hasOwnProperty.call(
    initialSnapshot ?? {},
    'collectionAnimes'
  );
  const hasInitialFeatured = Object.prototype.hasOwnProperty.call(
    initialSnapshot ?? {},
    'featuredAnimes'
  );
  const initialAnimes = useMemo(
    () =>
      mergeAnimeList(initialSeedAnimes, [
        ...(initialSnapshot?.collectionAnimes ?? []),
        ...(initialSnapshot?.featuredAnimes ?? []),
      ]),
    [initialSeedAnimes, initialSnapshot]
  );

  // ─── Data state ─────────────────────────────────────────────────────────
  // Collection + featured-backfilled animes are the canonical "known" set.
  // Bounds-driven lazy loading appends entries from the offline anitabi index
  // as the user pans, so the on-map markers + sheet list grow with the view.
  const [animes, setAnimes] = useState<AnitabiBangumi[]>(() => initialAnimes);
  const animesRef = useRef<AnitabiBangumi[]>(initialAnimes);
  const [collectionIds, setCollectionIds] = useState<Set<number>>(
    () => new Set((initialSnapshot?.collectionAnimes ?? []).map((anime) => anime.id))
  );
  const [loading, setLoading] = useState(initialAnimes.length === 0);
  // Seed synchronously from MMKV so visited markers + the capture count are
  // correct on the first frame; the effects below still reconcile after the
  // one-time migration.
  const [visited] = useState<VisitedMap>(loadVisitedSpotsSync);
  const [captureCount] = useState(
    () => Object.keys(loadCapturesSync()).length
  );

  // Lazy-loaded entries from the offline index, keyed by bangumi id and
  // additive only (we never remove — the WebView dedups by id so duplicates
  // are cheap, and pan-back-and-forth wants the markers to stay put).
  const [extraIndexed, setExtraIndexed] = useState<Map<number, AnitabiIndexEntry>>(
    () => new Map()
  );
  const extraIndexedRef = useRef(extraIndexed);

  const userLocationRef = useRef<LatLng | null>(userLocation);

  animesRef.current = animes;

  // ─── Data loading ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingFeatured: AnitabiBangumi[] = [];

    const mergeAnimes = (incoming: readonly AnitabiBangumi[]) => {
      if (incoming.length === 0) return;
      setAnimes((current) => mergeAnimeList(current, incoming));
    };

    const commitFeatured = () => {
      flushTimer = null;
      if (cancelled || pendingFeatured.length === 0) return;
      const batch = pendingFeatured.splice(0);
      mergeAnimes(batch);
    };

    const scheduleFeaturedCommit = () => {
      if (flushTimer !== null) return;
      flushTimer = setTimeout(commitFeatured, 200);
    };

    const hydrateFeatured = () => {
      // Bounded-concurrency pool over FEATURED_PILGRIMAGE_IDS: at most
      // FEATURED_FETCH_CONCURRENCY `/lite` fetches run at once. Each settled
      // request pulls the next id off the queue, so the end result (every id
      // fetched, batched via scheduleFeaturedCommit, flushed once the last
      // one settles) and the cancellation semantics are unchanged — only the
      // cold-start request storm is bounded.
      const queue = FEATURED_PILGRIMAGE_IDS.slice();
      let remaining = queue.length;
      if (remaining === 0) return;

      const settleOne = () => {
        if (cancelled) return;
        remaining -= 1;
        if (remaining === 0) {
          if (flushTimer !== null) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          commitFeatured();
          return;
        }
        pump();
      };

      const fetchOne = (bangumiId: number) => {
        pilgrimageRepository
          .getSpotsByBangumiId(bangumiId)
          .then((anime) => {
            if (cancelled || !anime) return;
            pendingFeatured.push(anime);
            scheduleFeaturedCommit();
          })
          .catch((err) => {
            if (!cancelled) {
              console.warn('[PilgrimageMap] featured fetch failed:', bangumiId, err);
            }
          })
          .finally(settleOne);
      };

      // Pull the next id off the queue when a slot frees up.
      const pump = () => {
        if (cancelled) return;
        const next = queue.shift();
        if (next === undefined) return;
        fetchOne(next);
      };

      const initial = Math.min(FEATURED_FETCH_CONCURRENCY, queue.length);
      for (let i = 0; i < initial; i += 1) pump();
    };

    (async () => {
      let collectionCount = initialSnapshot?.collectionAnimes?.length ?? 0;
      if (!hasInitialCollection) {
        const collected = new Set<number>();
        try {
          const entries = await collectionPilgrimageService.getEntries();
          if (cancelled) return;
          const collectionAnimes: AnitabiBangumi[] = [];
          for (const e of entries) {
            if (e.anime && !collected.has(e.anime.id)) {
              collectionAnimes.push(e.anime);
              collected.add(e.anime.id);
            }
          }
          collectionCount = collectionAnimes.length;
          setCollectionIds(collected);
          mergeAnimes(collectionAnimes);
        } catch (err) {
          console.warn('[PilgrimageMap] collection load failed:', err);
        } finally {
          if (!cancelled) setLoading(false);
        }
      } else {
        if (!cancelled) setLoading(false);
      }

      if (!cancelled && !hasInitialFeatured && collectionCount < COLLECTION_BACKFILL_TARGET) {
        hydrateFeatured();
      }
    })();

    return () => {
      cancelled = true;
      if (flushTimer !== null) clearTimeout(flushTimer);
    };
  }, [hasInitialCollection, hasInitialFeatured, initialSnapshot]);

  // `visited` and `captureCount` are seeded synchronously from MMKV in the
  // useState initializers above. The previous async reconcile was a no-op on
  // the render path now that reads are sync — drop it to avoid an extra
  // re-render that re-rendered the WebView marker layer for no reason.

  // Keep the imperative ref aligned with the hook's location so callers that
  // depend on it (mergeNearbyIndexed below) see the latest fix without
  // reading React state at sync time.
  userLocationRef.current = userLocation;

  const appendExtraIndexed = useCallback((entries: readonly AnitabiIndexEntry[]) => {
    if (entries.length === 0) return;
    const next = appendIndexedEntriesExcludingKnownAnimes(
      extraIndexedRef.current,
      entries,
      animesRef.current
    );
    if (next === extraIndexedRef.current) return;
    extraIndexedRef.current = next;
    setExtraIndexed(next);
  }, []);

  const mergeNearbyIndexed = useCallback(
    (loc: LatLng) => {
      const seen = buildKnownAnimeIdSet(animesRef.current, extraIndexedRef.current);
      appendExtraIndexed(getNearbyMapEntries(loc, { exclude: seen }));
    },
    [appendExtraIndexed]
  );

  // Whenever the tracking hook surfaces a new location, refresh the
  // nearby-anime overlay so the lazy-loaded index keeps pace with the user.
  useEffect(() => {
    if (!userLocation) return;
    mergeNearbyIndexed(userLocation);
  }, [userLocation, mergeNearbyIndexed]);

  const handleBoundsChange = useCallback(
    (bounds: BoundingBox) => {
      if (!shouldLoadPilgrimageMapBounds(bounds)) return;
      const seen = buildKnownAnimeIdSet(animesRef.current, extraIndexedRef.current);
      appendExtraIndexed(getAnimeInBounds(bounds, { exclude: seen, limit: 40 }));
    },
    [appendExtraIndexed]
  );

  // ─── Derived: full list of known anime (collection + featured + lazy) ──
  const knownAnimes = useMemo<AnitabiBangumi[]>(() => {
    const merged = new Map<number, AnitabiBangumi>();
    for (const a of animes) merged.set(a.id, a);
    // Index-derived entries lack litePoints, but carry enough to render on
    // the map + a placeholder row. We synthesise a minimal AnitabiBangumi.
    for (const entry of extraIndexed.values()) {
      if (merged.has(entry.id)) continue;
      merged.set(entry.id, seedPilgrimageAnimeFromIndex(entry));
    }
    return [...merged.values()];
  }, [animes, extraIndexed]);

  return {
    animes,
    knownAnimes,
    collectionIds,
    extraIndexed,
    loading,
    visited,
    captureCount,
    handleBoundsChange,
  };
}
