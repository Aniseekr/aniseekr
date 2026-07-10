// usePilgrimageHubScreenData — data cluster for the pilgrimage hub list screen
// (app/(tabs)/pilgrimage/index.tsx). Mirrors usePilgrimageHubData (the map's
// sibling): owns the snapshot/offline-index seed, the collection + featured
// /lite backfill, MMKV-seeded visited/spot-intents, the location fix, and the
// nearest-spot lookup that follows it, so the route file stays a view
// orchestrator (CLAUDE.md Rule 9). View controls (sort key) and the 88 rail's
// index-version subscription stay in the screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { pilgrimageRepository } from '../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../libs/services/pilgrimage/featured-anime';
import { collectionPilgrimageService } from '../libs/services/pilgrimage/collection-pilgrimage-service';
import { locationService, type LatLng } from '../libs/services/pilgrimage/location-service';
import { loadVisitedSpotsSync, type VisitedMap } from '../libs/services/pilgrimage/visited-prefs';
import { loadSpotIntentsSync, type SpotIntentMap } from '../libs/services/pilgrimage/spot-intents';
import {
  getPilgrimageHubSnapshot,
  updatePilgrimageHubSnapshot,
  PERSIST_TTL_MS as HUB_SNAPSHOT_PERSIST_TTL_MS,
  type PilgrimageHubSnapshot,
} from '../libs/services/pilgrimage/pilgrimage-hub-cache';
import { buildSeededPilgrimageAnimes } from '../libs/services/pilgrimage/pilgrimage-screen-state';
import { buildPilgrimageCollectionState } from '../libs/services/pilgrimage/pilgrimage-hub-collection-state';
import { getSpotsNear } from '../libs/services/pilgrimage/spot-index-service';
import type { NearbySpotHit } from '../libs/services/pilgrimage/spot-index';
import type { AnitabiBangumi } from '../libs/services/pilgrimage/types';
import { useT } from '../libs/i18n';

export interface UsePilgrimageHubScreenData {
  collectionAnimes: AnitabiBangumi[];
  featuredAnimes: AnitabiBangumi[];
  loading: boolean; // collectionLoading || featuredLoading
  error: string | null;
  visited: VisitedMap; // MMKV-seeded, read-only this screen
  spotIntents: SpotIntentMap; // MMKV-seeded, read-only this screen
  userLocation: LatLng | null;
  // Nearest single point-level spot for the hero card, resolved off
  // userLocation once a fix lands. Not in the original brief's interface —
  // added after P2-T8 introduced the effect in index.tsx; it's a direct
  // extension of the location-fix data flow this hook already owns, so it
  // moves in with the rest of the data cluster rather than staying screen-side.
  nearestSpot: NearbySpotHit | null;
}

function hasSnapshotSlice<K extends keyof PilgrimageHubSnapshot>(
  snapshot: PilgrimageHubSnapshot | null,
  key: K
): boolean {
  return !!snapshot && Object.prototype.hasOwnProperty.call(snapshot, key);
}

function buildSeededFeatured(): AnitabiBangumi[] {
  return buildSeededPilgrimageAnimes(FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) => bangumiId));
}

export function usePilgrimageHubScreenData(): UsePilgrimageHubScreenData {
  const t = useT();
  // Stale-while-revalidate: accept a persisted snapshot up to the 24h budget
  // it's written with, not the tighter 5-min default — a cold start after an
  // overnight-closed app should still paint collection/featured cards from
  // disk instead of dropping back to the bundled offline seed.
  const [initialSnapshot] = useState(() => getPilgrimageHubSnapshot(HUB_SNAPSHOT_PERSIST_TTL_MS));
  const hasInitialCollection = hasSnapshotSlice(initialSnapshot, 'collectionAnimes');
  const hasInitialFeatured = hasSnapshotSlice(initialSnapshot, 'featuredAnimes');

  const [collectionAnimes, setCollectionAnimes] = useState<AnitabiBangumi[]>(
    () => initialSnapshot?.collectionAnimes ?? []
  );
  // Seed featured from the bundled offline index so the rail renders on frame
  // 1 even on a fresh install (no SQLite cache yet). The HTTP fill-in below
  // upgrades each entry with `litePoints` as responses stream in. This is
  // what kills the 30s+ skeleton — first paint now happens in <100ms.
  const [featuredAnimes, setFeaturedAnimes] = useState<AnitabiBangumi[]>(() => {
    const cached = initialSnapshot?.featuredAnimes;
    if (cached && cached.length > 0) return cached;
    return buildSeededFeatured();
  });
  const [collectionLoading, setCollectionLoading] = useState(!hasInitialCollection);
  // `featuredLoading` now means "still filling in litePoints", not "no cards
  // at all" — the seed gives us cards from the start. The skeleton below
  // gates on `animeCards.length === 0`, so it only shows when we genuinely
  // have nothing to render.
  const [featuredLoading, setFeaturedLoading] = useState(!hasInitialFeatured);
  // Visited / spot-intents are seeded synchronously from live MMKV — never
  // from the snapshot slice, which can be up to 24h stale (persist TTL) and
  // would freeze the hub's visited/planned markers behind a check-in the
  // user made on another screen after the snapshot was last written. Per-spot
  // toggles flow through their own atomic writers; this hook only re-reads
  // on focus below (mirrors plan.tsx's skip-first-focus re-seed).
  const [visited, setVisited] = useState<VisitedMap>(loadVisitedSpotsSync);
  const [spotIntents, setSpotIntents] = useState<SpotIntentMap>(loadSpotIntentsSync);
  const [userLocation, setUserLocation] = useState<LatLng | null>(
    () => initialSnapshot?.userLocation ?? null
  );
  const [error, setError] = useState<string | null>(null);

  const loading = collectionLoading || featuredLoading;

  const refreshCollectionAnimes = useCallback(
    async ({
      isActive = () => true,
      clearOnError = false,
    }: {
      isActive?: () => boolean;
      clearOnError?: boolean;
    } = {}): Promise<number | null> => {
      try {
        const entries = await collectionPilgrimageService.getEntries();
        if (!isActive()) return null;
        const { collectionAnimes: animes } = buildPilgrimageCollectionState(entries);
        setCollectionAnimes(animes);
        updatePilgrimageHubSnapshot({ collectionAnimes: animes });
        return animes.length;
      } catch (err: unknown) {
        if (!isActive()) return null;
        // Collection failures shouldn't block the hub — featured backfill is
        // enough to render something useful.
        console.warn('[PilgrimageHub] collection load failed:', err);
        if (clearOnError) setCollectionAnimes([]);
        return null;
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() =>
        refreshCollectionAnimes({
          isActive: () => !cancelled,
          clearOnError: !hasInitialCollection,
        })
      )
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCollectionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasInitialCollection, refreshCollectionAnimes]);

  const focusRefreshSeenRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusRefreshSeenRef.current) {
        focusRefreshSeenRef.current = true;
        return;
      }
      // Screens pushed on top (spot detail check-in, save/plan toggles, the
      // trip map) can change visited/spot-intents in MMKV while the hub stays
      // mounted underneath — re-seed on every focus after the first so
      // returning here shows current state instead of the value frozen at
      // mount (mirrors plan.tsx).
      setVisited(loadVisitedSpotsSync());
      setSpotIntents(loadSpotIntentsSync());
      let active = true;
      refreshCollectionAnimes({
        isActive: () => active,
      }).catch(() => undefined);
      return () => {
        active = false;
      };
    }, [refreshCollectionAnimes])
  );

  useEffect(() => {
    let cancelled = false;
    setFeaturedLoading(!hasInitialFeatured);

    // Stream the per-anime `/lite` responses in instead of waiting for all
    // ~30 to settle. The seeded list is rendered first; each successful HTTP
    // response merges its richer payload (mainly `litePoints`) into state.
    // setState calls are coalesced via a 200ms batch window so we don't
    // re-run `allSpots` 30 times in a row on a cold install.
    const ids = FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) => bangumiId);
    const pending: AnitabiBangumi[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const commit = () => {
      flushTimer = null;
      if (cancelled || pending.length === 0) return;
      const batch = pending.splice(0);
      setFeaturedAnimes((current) => {
        const byId = new Map(current.map((a) => [a.id, a] as const));
        for (const fresh of batch) byId.set(fresh.id, fresh);
        const merged = Array.from(byId.values()).sort(
          (a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0)
        );
        updatePilgrimageHubSnapshot({ featuredAnimes: merged });
        return merged;
      });
    };

    const scheduleCommit = () => {
      if (flushTimer != null) return;
      flushTimer = setTimeout(commit, 200);
    };

    let remaining = ids.length;
    let anySuccess = false;
    for (const id of ids) {
      pilgrimageRepository
        .getSpotsByBangumiId(id)
        .then((anime) => {
          if (cancelled) return;
          if (anime) {
            anySuccess = true;
            pending.push(anime);
            scheduleCommit();
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // Per-anime failures are common (404, transient network) — don't
          // surface them, just leave the seeded card alone.
          console.warn('[PilgrimageHub] featured fetch failed:', id, err);
        })
        .finally(() => {
          if (cancelled) return;
          remaining -= 1;
          if (remaining === 0) {
            if (flushTimer != null) {
              clearTimeout(flushTimer);
              flushTimer = null;
            }
            commit();
            // Only show the network error when we had no seeded fallback AND
            // every request failed; otherwise the user already sees cards.
            if (!anySuccess && !hasInitialFeatured && featuredAnimes.length === 0) {
              setError(t('tabs.pilgrimageScreen.errorLoadFailed'));
            } else {
              setError(null);
            }
            setFeaturedLoading(false);
          }
        });
    }

    return () => {
      cancelled = true;
      if (flushTimer != null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };
    // featuredAnimes intentionally excluded — only read at error time and the
    // value at effect-mount is what we want there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInitialFeatured]);

  // Visited / spot-intents are seeded synchronously above from MMKV; no
  // async reconcile needed. The snapshot is also primed from those seeds.
  useEffect(() => {
    updatePilgrimageHubSnapshot({ visited });
    // Only fires once on first mount — `visited` is the seed value and
    // doesn't change here. Per-spot toggles flow through their own writers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!cancelled) {
          setUserLocation(loc ?? null);
          updatePilgrimageHubSnapshot({ userLocation: loc ?? null });
        }
      })
      .catch(() => {
        if (!cancelled) updatePilgrimageHubSnapshot({ userLocation: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nearest single point-level spot for the hero card (spec 2.4). Loaded lazily
  // off the SQLite spots index when a location fix lands; null when we have no
  // location or the index has nothing within 50km (honest empty state).
  const [nearestSpot, setNearestSpot] = useState<NearbySpotHit | null>(null);
  useEffect(() => {
    if (!userLocation) {
      setNearestSpot(null);
      return;
    }
    let active = true;
    getSpotsNear(userLocation, 50, 1)
      .then((hits) => {
        if (active) setNearestSpot(hits[0] ?? null);
      })
      .catch(() => {
        if (active) setNearestSpot(null);
      });
    return () => {
      active = false;
    };
  }, [userLocation]);

  return {
    collectionAnimes,
    featuredAnimes,
    loading,
    error,
    visited,
    spotIntents,
    userLocation,
    nearestSpot,
  };
}
