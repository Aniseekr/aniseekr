// Pilgrimage hub map. Map-first design mirroring the per-anime detail screen
// (app/(tabs)/pilgrimage/[animeId].tsx) so the user perceives the hub -> detail
// transition as a continuous focus shift instead of a hard page change:
//
//   - Full-bleed MapLibre Native is the primary surface.
//   - A floating top overlay carries back + album + an in-page search field,
//     plus a region chip strip for the Anime Tourism 88 selection.
//   - A persistent pull-up bottom sheet (PilgrimageHubSheet) hosts the
//     focused-anime card, hub stats, and the nearby anime list.
//   - A floating bottom chrome (filter chips + Grid/Rows toggle) is anchored
//     to the sheet's top edge via a shared value so it hugs the handle as the
//     user drags.
//
// Tapping an anime — on the map, on the focused card, or on a list row —
// pushes to `/pilgrimage/[animeId]`, which is the same map+sheet shell zoomed
// to one anime. The swap arrow on the focused card cycles the nearest list
// without leaving this screen.
//
// Lives outside the Tabs UI so the bottom dock + hub top-bar both disappear.
//
// Route params:
//   - focus?: number — bangumi id to focus the map on (initial centre)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { ThemedText, Skeleton, readableTextOn } from '../../../components/themed';
import { locationService, type LatLng } from '../../../libs/services/pilgrimage/location-service';
import {
  LOCATE_FAB_COMPASS_ZOOM,
  LOCATE_FAB_ZOOM,
  useUserLocationTracking,
} from '../../../libs/services/pilgrimage/use-user-location-tracking';
import { LocateFab } from '../../../components/pilgrimage/LocateFab';
import { LocationPermissionSheet } from '../../../components/pilgrimage/LocationPermissionSheet';
import {
  ANIME_TOURISM_88_REGIONS,
  get88EntriesWithCoords,
  type AnimeTourism88Region,
  type AnimeTourism88EntryWithCoords,
} from '../../../libs/services/pilgrimage/anime88-repository';
import { getNumberParam, getStringParam } from '../../../libs/utils/route-params';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import { OFFICIAL_88_GOLD } from '../../../libs/services/pilgrimage/region-color';
import {
  MapSurface,
  type BBox,
  type MapMarker,
  type MapSurfaceHandle,
  type Viewport,
} from '../../../components/pilgrimage/map';
import { MapOfflineOverlay } from '../../../components/pilgrimage/MapOfflineOverlay';
import { CLUSTER_DISABLE_AT } from '../../../libs/services/pilgrimage/map-engine/cluster-style';
import {
  loadMapStyleOverrideSync,
  resolveMapStyleUrl,
  subscribeMapStyleOverride,
} from '../../../libs/services/pilgrimage/map-source-prefs';
import { resolveMapModeWithClock } from '../../../libs/services/pilgrimage/map-theme-clock';
import { useMapThemePref } from '../../../hooks/useMapThemePref';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import {
  getPilgrimageHubSnapshot,
  updatePilgrimageHubSnapshot,
} from '../../../libs/services/pilgrimage/pilgrimage-hub-cache';
import { resolvePilgrimageHubInitialView } from '../../../libs/services/pilgrimage/pilgrimage-hub-initial-view';
import { resolvePilgrimageMapInitialMode } from '../../../libs/services/pilgrimage/pilgrimage-design-flow';
import { type PilgrimageMapViewMode } from '../../../libs/services/pilgrimage/map-view-mode-prefs';
import { usePilgrimageHubData } from '../../../hooks/usePilgrimageHubData';
import { usePilgrimageMapScreenState, type HubFilter } from '../../../hooks/usePilgrimageMapScreenState';
import {
  PilgrimageHubSheet,
  type HubAnimeEntry,
  type HubStats,
} from '../../../components/pilgrimage/PilgrimageHubSheet';
import { RoundHeaderButton } from '../../../components/pilgrimage/detail/RoundHeaderButton';
import { FilterPill } from '../../../components/pilgrimage/detail/FilterPill';
import { buildMapsURL } from '../../../components/pilgrimage/detail';
import { useT, type TranslationKey } from '../../../libs/i18n';
import { getSpotsNear } from '../../../libs/services/pilgrimage/spot-index-service';
import { buildNearbySpotsFromIndex } from '../../../libs/services/pilgrimage/nearby-spots';
import { getIndexedById } from '../../../libs/services/pilgrimage/anitabi-index';
import { MAP_LOCATE_RADIUS_KM } from '../../../libs/services/pilgrimage/map-nearby';
import type { NearbySpot } from '../../../libs/services/pilgrimage/nearby-spots';

// 7-region taxonomy from animetourism88.com — Tokyo is split from Kanto.
// Values point into the shared `pilgrimage.regions.*` catalog so this rail,
// Tourism88Rail, and album.tsx all localize to the same wording.
const REGION_LABEL_KEY: Record<AnimeTourism88Region, TranslationKey> = {
  hokkaido_tohoku: 'pilgrimage.regions.hokkaido_tohoku',
  kanto: 'pilgrimage.regions.kanto',
  tokyo: 'pilgrimage.regions.tokyo',
  chubu: 'pilgrimage.regions.chubu',
  kinki: 'pilgrimage.regions.kinki',
  chugoku_shikoku: 'pilgrimage.regions.chugoku_shikoku',
  kyushu_okinawa: 'pilgrimage.regions.kyushu_okinawa',
};

// Geographic bounding boxes for each region. Hand-tuned to feel like a
// regional view (not a city zoom): a region tap should let the user see "the
// whole Kanto / whole Kyushu" before they drill into a specific anime.
// Tokyo Metro is the 23-ward area so it stays distinct from the wider Kanto.
// BBox is the MapSurface fitBounds payload shape.
const REGION_BOUNDS: Record<AnimeTourism88Region, BBox> = {
  hokkaido_tohoku: { south: 37.0, west: 139.4, north: 45.6, east: 146.0 },
  kanto: { south: 35.0, west: 138.7, north: 37.0, east: 141.0 },
  tokyo: { south: 35.5, west: 139.3, north: 35.9, east: 140.0 },
  chubu: { south: 34.6, west: 136.0, north: 38.0, east: 139.5 },
  kinki: { south: 33.5, west: 134.2, north: 35.8, east: 136.5 },
  chugoku_shikoku: { south: 32.5, west: 130.7, north: 35.7, east: 134.5 },
  kyushu_okinawa: { south: 24.0, west: 122.9, north: 34.5, east: 132.0 },
};

// Smallest box enclosing every selected region — the camera fits this so a
// multi-region selection frames all of them at once. Assumes a non-empty list.
function unionRegionBounds(regions: readonly AnimeTourism88Region[]): BBox {
  const first = REGION_BOUNDS[regions[0]];
  let { south, west, north, east } = first;
  for (let i = 1; i < regions.length; i += 1) {
    const b = REGION_BOUNDS[regions[i]];
    south = Math.min(south, b.south);
    west = Math.min(west, b.west);
    north = Math.max(north, b.north);
    east = Math.max(east, b.east);
  }
  return { south, west, north, east };
}

// Whole-Japan bounding box — south of Yonaguni to north of Hokkaido.
// Used when the user taps the "全日本" reset chip.
const JAPAN_BOUNDS: BBox = {
  south: 24.0,
  west: 122.9,
  north: 45.6,
  east: 146.0,
};

function build88Markers(entries: readonly AnimeTourism88EntryWithCoords[]): MapMarker[] {
  const out: MapMarker[] = [];
  for (const e of entries) {
    const bangumi = e.externalIds.bangumi;
    if (typeof bangumi !== 'number') continue;
    out.push({
      id: `88:${e.id}`,
      kind: 'city88',
      bangumiId: bangumi,
      lat: e.lat,
      lng: e.lng,
      image: '',
      title: e.titleEn || e.titleJa,
      city: `${e.prefecture ?? ''}${e.city}`,
      pointsLength: 0,
      color: OFFICIAL_88_GOLD,
      eightyEightId: e.id,
    });
  }
  return out;
}

function isValidGeo(geo: readonly [number, number] | null | undefined): boolean {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

// Sheet snap peek fraction — kept in lockstep with PilgrimageHubSheet's snap
// array. Used as a fallback chrome offset if the sheet's animatedPosition
// hasn't been written yet.
const SHEET_PEEK_FRACTION = 0.16;
const VIEW_MODE_TOGGLE_HEIGHT = 52;

export default function PilgrimageMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams();
  const initialMode = useMemo(() => resolvePilgrimageMapInitialMode(params.mode), [params.mode]);
  const focusBangumiIdParam = getNumberParam(params, 'focus');
  const { theme, effectiveMode } = useTheme();
  const { pref: mapThemePref } = useMapThemePref();
  const styles = useMemo(() => makeStyles(theme, insets.top), [theme, insets.top]);
  const themeColor = theme.accent;
  const themeColorFg = readableTextOn(themeColor);

  // The hub renders its own native <MapSurface> inline (no portal). Because the
  // pilgrimage stack keeps THIS screen mounted when detail is pushed on top, the
  // map stays warm across hub→detail→back; and a native map inside the screen is
  // correctly hidden by the navigator when covered, so it can't bleed through
  // (which the old portal-above-navigator layer couldn't prevent for a native
  // GL surface). recenter/heading/focus are driven imperatively (Rule 9).
  const mapRef = useRef<MapSurfaceHandle>(null);

  // Resolved MapLibre style URL (D7 seam) — repaints in place on theme/source change.
  const [styleOverride, setStyleOverride] = useState(loadMapStyleOverrideSync);
  useEffect(() => subscribeMapStyleOverride(setStyleOverride), []);
  // 'auto' picks dark at night (18:00–06:00) as well as in a dark app theme.
  // Poll the hour once a minute so a map left open actually flips (same-value
  // setState bails, so this is render-free the other 59 minutes).
  const [clockHour, setClockHour] = useState(() => new Date().getHours());
  useEffect(() => {
    if (mapThemePref !== 'auto') return;
    const id = setInterval(() => setClockHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, [mapThemePref]);
  const styleUrl = resolveMapStyleUrl(
    resolveMapModeWithClock(mapThemePref, effectiveMode, clockHour),
    styleOverride
  );

  const [initialSnapshot] = useState(() => getPilgrimageHubSnapshot());
  const initialSnapshotHasUserLocation = Object.prototype.hasOwnProperty.call(
    initialSnapshot ?? {},
    'userLocation'
  );
  const autoPermissionPromptedRef = useRef(false);

  // The locate FAB and the map's user puck share a single hook so the dot, the
  // cone, the recentre, and the permission sheet all stay in sync. Snapshot-
  // seeded `initialLocation` keeps the dot visible on warm starts.
  const [initialUserLocation] = useState<LatLng | null>(() =>
    initialSnapshotHasUserLocation
      ? (initialSnapshot?.userLocation ?? null)
      : locationService.getCached()
  );
  const tracking = useUserLocationTracking({
    initialLocation: initialUserLocation,
    // Hub map is a "where am I" surface — default to following the user the
    // first time permission is observed granted (opt-in; the detail screen
    // does NOT pass this so it keeps centering on the anime).
    autoEngage: true,
    onFollowLocation: (loc, fs) => {
      mapRef.current?.recenter(
        loc.latitude,
        loc.longitude,
        fs === 'compass' ? LOCATE_FAB_COMPASS_ZOOM : LOCATE_FAB_ZOOM,
        { animate: true }
      );
    },
    onHeadingChange: (deg) => {
      mapRef.current?.setHeading(deg);
    },
  });
  const userLocation = tracking.location;
  const {
    state: locateState,
    permission: locatePermission,
    isRequestingPermission,
    permissionSheetVisible,
    cycleState,
    onUserPan,
    dismissPermissionSheet,
    requestPermissionSheet,
  } = tracking;

  useEffect(() => {
    if (!userLocation) return;
    updatePilgrimageHubSnapshot({ userLocation });
  }, [userLocation]);

  // Frame-1 camera seed: align the native Camera's initialViewState with the
  // first focused card candidate so the map does not open at whole-Japan and
  // immediately animate elsewhere on cold devices.
  const [initialView] = useState(() =>
    resolvePilgrimageHubInitialView({
      focusBangumiId: focusBangumiIdParam,
      snapshot:
        initialUserLocation && !initialSnapshotHasUserLocation
          ? {
              ...(initialSnapshot ?? { updatedAt: Date.now() }),
              userLocation: initialUserLocation,
              userLocationUpdatedAt: Date.now(),
            }
          : initialSnapshot,
    })
  );

  const initialHubFilter = useMemo<HubFilter>(() => {
    const raw = getStringParam(params, 'filter');
    return raw === 'collection' || raw === 'official88' ? raw : 'all';
  }, [params]);
  // ─── View state (parent-owned) — lifted into usePilgrimageMapScreenState so
  // this screen stays a view orchestrator (CLAUDE.md Rule 9). Derived memos
  // below (hubEntries, filteredEntries, markers, stats, focusedAnime) and the
  // imperative camera effects consume these outputs.
  const {
    searchQuery,
    deferredSearchQuery,
    hubFilter,
    listLayout,
    selectedRegions,
    flyTick,
    focusedAnimeId,
    mapViewMode,
    setFocusedAnimeId,
    persistMapViewMode,
    handleSearchChange,
    handleSearchClear,
    handlePickFilter,
    handlePickLayout,
    handlePickRegion,
    handleResetToJapan,
  } = usePilgrimageMapScreenState({
    initialFilter: initialHubFilter,
    initialFocusBangumiId: focusBangumiIdParam,
  });

  // Base-map load failure (offline + no cached tiles). `mapReloadKey` remounts
  // the GL surface so "Retry" actually re-attempts the style fetch.
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [mapReloadKey, setMapReloadKey] = useState(0);

  // ─── Data cluster (collection + featured + lazy index, MMKV-seeded) ──────
  // Lifted into usePilgrimageHubData so this screen stays a view orchestrator
  // (CLAUDE.md Rule 9). The hook owns the snapshot/index seed, the loading
  // transitions, the bounds-/location-driven lazy loading, and the synchronous
  // visited/capture seeding; it consumes the live userLocation we feed in.
  const { knownAnimes, collectionIds, loading, visited, captureCount, handleBoundsChange } =
    usePilgrimageHubData({ focusBangumiId: focusBangumiIdParam, userLocation });

  const handleMapBoundsChange = useCallback(
    (bounds: BBox, viewport?: Viewport) => {
      handleBoundsChange(bounds);
      if (!viewport) return;
      updatePilgrimageHubSnapshot({
        mapViewport: {
          center: { ...viewport.center },
          zoom: viewport.zoom,
        },
      });
    },
    [handleBoundsChange]
  );

  // ─── Derived: 88-selection lookup ──────────────────────────────────────
  const all88WithCoords = useMemo(() => get88EntriesWithCoords(), []);

  // Map from 88-entry bangumi id → eightyEightId so we can flag 88-selected
  // anime in the hub list and on the focused card.
  const eightyEightIdByBangumiId = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of all88WithCoords) {
      const bid = e.externalIds.bangumi;
      if (typeof bid === 'number') map.set(bid, e.id);
    }
    return map;
  }, [all88WithCoords]);

  // Build hub entries: collection / 88 / distance / visited counts.
  // The list is sorted by:
  //   1. distance from user (when location is known)
  //   2. otherwise by pointsLength desc — matches the old "popular" ordering.
  const hubEntries = useMemo<HubAnimeEntry[]>(() => {
    const out: HubAnimeEntry[] = [];
    for (const anime of knownAnimes) {
      if (!isValidGeo(anime.geo)) continue;
      let distanceKm: number | undefined;
      if (userLocation) {
        const d = locationService.getDistanceKm(userLocation, {
          latitude: anime.geo[0],
          longitude: anime.geo[1],
        });
        if (Number.isFinite(d)) distanceKm = d;
      }
      // Use the visited map intersected with litePoints to give a per-anime
      // visited count. This is approximate (litePoints is a sample) — it's
      // visible enough to motivate the user but cheap to compute.
      let visitedCount = 0;
      for (const p of anime.litePoints ?? []) {
        if (visited[p.id]) visitedCount += 1;
      }
      out.push({
        anime,
        distanceKm,
        fromCollection: collectionIds.has(anime.id),
        visitedCount,
        photoCount: 0,
        is88: eightyEightIdByBangumiId.has(anime.id),
      });
    }
    out.sort((a, b) => {
      if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.distanceKm !== undefined) return -1;
      if (b.distanceKm !== undefined) return 1;
      return (b.anime.pointsLength ?? 0) - (a.anime.pointsLength ?? 0);
    });
    return out;
  }, [knownAnimes, userLocation, collectionIds, visited, eightyEightIdByBangumiId]);

  // Apply hub filter + search query.
  const filteredEntries = useMemo<HubAnimeEntry[]>(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    return hubEntries.filter((entry) => {
      if (hubFilter === 'collection' && !entry.fromCollection) return false;
      if (hubFilter === 'official88' && !entry.is88) return false;
      if (query) {
        const titles = getPilgrimageAnimeTitles(entry.anime);
        const haystack = [
          titles.primary,
          titles.original,
          titles.chinese,
          titles.english,
          titles.romaji,
          entry.anime.city,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [hubEntries, hubFilter, deferredSearchQuery]);

  const filterCounts = useMemo(() => {
    let all = 0;
    let collection = 0;
    let official88 = 0;
    for (const e of hubEntries) {
      all += 1;
      if (e.fromCollection) collection += 1;
      if (e.is88) official88 += 1;
    }
    return { all, collection, official88 };
  }, [hubEntries]);

  // Focused anime (the swap-able card on the sheet). Falls back to the first
  // entry in the filtered list when the previous focus has been filtered out.
  const focusedAnime = useMemo<HubAnimeEntry | null>(() => {
    if (filteredEntries.length === 0) return null;
    if (focusedAnimeId !== null) {
      const found = filteredEntries.find((e) => e.anime.id === focusedAnimeId);
      if (found) return found;
    }
    return filteredEntries[0];
  }, [filteredEntries, focusedAnimeId]);

  // Reset focused id if it falls out of the filtered set (so the next swap
  // starts cycling from the new top of list).
  useEffect(() => {
    if (filteredEntries.length === 0) return;
    if (focusedAnimeId === null) return;
    const inList = filteredEntries.some((e) => e.anime.id === focusedAnimeId);
    if (!inList) setFocusedAnimeId(null);
  }, [filteredEntries, focusedAnimeId]);

  const handleSwapFocused = useCallback(() => {
    if (filteredEntries.length < 2) return;
    Haptics.selectionAsync().catch(() => undefined);
    setFocusedAnimeId((current) => {
      const ids = filteredEntries.map((e) => e.anime.id);
      const idx = current === null ? 0 : ids.indexOf(current);
      const next = idx < 0 ? 1 : (idx + 1) % ids.length;
      return ids[next] ?? null;
    });
  }, [filteredEntries]);

  // ─── Marker building ───────────────────────────────────────────────────
  // Hub map shows centroids for filteredEntries (so the user's filter and
  // search apply to what's visible on the map too). The Official 88 chip on
  // the *top* region row swaps the underlying marker set to the gold 88 city
  // pins — that filter is on top of the hub filter (it's about which entries
  // we visualise on the map, while the hub filter is about which animes are
  // in the sheet list).
  const official88Mode = hubFilter === 'official88';

  const baseAnitabiMarkers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    for (const entry of filteredEntries) {
      const anime = entry.anime;
      if (!isValidGeo(anime.geo)) continue;
      const titles = getPilgrimageAnimeTitles(anime);
      out.push({
        id: `bgm:${anime.id}`,
        kind: 'anime',
        bangumiId: anime.id,
        lat: anime.geo[0],
        lng: anime.geo[1],
        image: anime.cover ?? '',
        title: titles.primary,
        city: anime.city ?? '',
        pointsLength: anime.pointsLength ?? 0,
        color: anime.color || theme.accent,
        // ≥1 known point checked in ⇒ the user has started this anime's route.
        visited: entry.visitedCount > 0,
      });
    }
    return out;
  }, [filteredEntries, theme.accent]);

  const markers = useMemo<MapMarker[]>(() => {
    if (!official88Mode) return baseAnitabiMarkers;
    const filtered =
      selectedRegions.size > 0
        ? all88WithCoords.filter((e) => selectedRegions.has(e.region))
        : all88WithCoords;
    return build88Markers(filtered);
  }, [official88Mode, selectedRegions, all88WithCoords, baseAnitabiMarkers]);

  // Camera-fly request derived from the selected regions + flyTick. Whole-Japan
  // when none are selected; the union of their bounds otherwise. flyTick
  // guarantees a new identity per tap so the map effect re-runs on re-taps.
  const flyBoundsRequest = useMemo(() => {
    if (flyTick === 0) return null; // initial render: map opens at Japan overview
    const regions = [...selectedRegions].sort();
    const bounds = regions.length > 0 ? unionRegionBounds(regions) : JAPAN_BOUNDS;
    return { key: `${regions.length > 0 ? regions.join('+') : 'jp'}#${flyTick}`, bounds };
  }, [selectedRegions, flyTick]);

  // ─── Hub stats (top of sheet) ──────────────────────────────────────────
  const stats = useMemo<HubStats>(() => {
    let totalScenes = 0;
    let visitedCount = 0;
    for (const e of filteredEntries) {
      totalScenes += e.anime.pointsLength ?? 0;
      visitedCount += e.visitedCount;
    }
    return {
      nearbyCount: filteredEntries.length,
      totalScenes,
      visitedCount,
      photoCount: captureCount,
    };
  }, [filteredEntries, captureCount]);

  // ─── Point-level "nearby spots" strip (spec 2.3) ───────────────────────
  // Low-frequency: re-queries only when the coarse user location or the
  // collection membership changes (Rule 9), not on every map pan/tick.
  const [nearbySpots, setNearbySpots] = useState<readonly NearbySpot[]>([]);
  useEffect(() => {
    if (!userLocation) {
      setNearbySpots([]);
      return;
    }
    let active = true;
    getSpotsNear(userLocation, MAP_LOCATE_RADIUS_KM, 40)
      .then((hits) => {
        if (!active) return;
        setNearbySpots(
          buildNearbySpotsFromIndex(
            hits,
            (id) => {
              const e = getIndexedById(id);
              return e ? { title: e.title, cn: e.cn, color: e.color } : null;
            },
            collectionIds
          )
        );
      })
      .catch(() => {
        if (active) setNearbySpots([]);
      });
    return () => {
      active = false;
    };
  }, [userLocation, collectionIds]);

  const handlePickNearbySpot = useCallback((spot: NearbySpot) => {
    setFocusedAnimeId(spot.animeId);
    mapRef.current?.recenter(spot.lat, spot.lng, 15, { animate: true });
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────────
  // Small clusters delegate to the surface (big ones zoom-to-fit inside the
  // engine). Fit their bbox; a same-building cluster (degenerate bbox) jumps
  // past CLUSTER_DISABLE_AT instead so the markers actually separate.
  const handleClusterPress = useCallback(
    (members: readonly MapMarker[]) => {
      if (members.length === 0) return;
      // Programmatic camera move driven by a cluster tap — pause follow
      // first (I5) so this content-focus breaks follow instead of fighting it.
      onUserPan();
      let south = 90,
        west = 180,
        north = -90,
        east = -180;
      for (const m of members) {
        south = Math.min(south, m.lat);
        north = Math.max(north, m.lat);
        west = Math.min(west, m.lng);
        east = Math.max(east, m.lng);
      }
      if (north - south < 0.0005 && east - west < 0.0005) {
        mapRef.current?.recenter(members[0].lat, members[0].lng, 16, { animate: true });
        return;
      }
      mapRef.current?.fitBounds?.({ south, west, north, east }, { animate: true });
    },
    [onUserPan]
  );

  // The actual drill-down. Same handler whether the user tapped a marker, the
  // focused card, or a list row. returnTo=map so the detail screen's back
  // button returns to *this* hub map view rather than the tab root.
  // Accepts an optional chrome seed so the detail screen can paint hero +
  // title + accent on frame 1 instead of flashing a skeleton (CLAUDE.md Rule 10).
  const navigateToDetail = useCallback(
    (bangumiId: number, anime?: AnitabiBangumi | null) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(
        buildPilgrimageDetailRoute(bangumiId, {
          returnTo: 'map',
          title: anime?.title || anime?.cn || null,
          titleSecondary: anime?.cn && anime.cn !== anime.title ? anime.cn : null,
          poster: anime?.cover ?? null,
          themeColor: anime?.color ?? null,
        })
      );
    },
    [router]
  );

  const handleMarkerPress = useCallback(
    (bangumiId: number) => {
      // Tapping a marker focuses the card AND drills in. This is the fastest
      // path to detail for users who already know which marker they want.
      setFocusedAnimeId(bangumiId);
      const anime = knownAnimes.find((a) => a.id === bangumiId) ?? null;
      navigateToDetail(bangumiId, anime);
    },
    [knownAnimes, navigateToDetail]
  );

  const handleSheetAnimePress = useCallback(
    (anime: AnitabiBangumi) => navigateToDetail(anime.id, anime),
    [navigateToDetail]
  );

  // Long-press quick actions on a hub marker. Scoped to two HONEST actions —
  // navigate / open detail — because spot-intents and visited are point-keyed;
  // 收藏/計畫/打卡 on an anime centroid would fabricate state (Rule 8) until
  // spot-level markers exist.
  const [quickActionMarker, setQuickActionMarker] = useState<MapMarker | null>(null);
  const handleMarkerLongPress = useCallback((m: MapMarker) => {
    Haptics.selectionAsync().catch(() => undefined);
    setQuickActionMarker(m);
  }, []);
  const closeQuickActions = useCallback(() => setQuickActionMarker(null), []);
  const handleQuickNavigate = useCallback(() => {
    const m = quickActionMarker;
    if (!m) return;
    Linking.openURL(buildMapsURL(m.lat, m.lng, m.title)).catch(() => undefined);
    setQuickActionMarker(null);
  }, [quickActionMarker]);
  const handleQuickOpen = useCallback(() => {
    const m = quickActionMarker;
    if (!m || m.bangumiId == null) return;
    setQuickActionMarker(null);
    handleMarkerPress(m.bangumiId);
  }, [quickActionMarker, handleMarkerPress]);

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

  const handleGoToCollection = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/collection');
  }, [router]);

  const handleMapLoadError = useCallback(() => setMapLoadFailed(true), []);
  const handleMapLoadSuccess = useCallback(() => setMapLoadFailed(false), []);
  const handleMapRetry = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setMapLoadFailed(false);
    setMapReloadKey((k) => k + 1);
  }, []);

  const handleOpenAlbum = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/pilgrimage/album');
  }, [router]);

  const handleOpenCamera = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/pilgrimage/capture');
  }, [router]);

  const flyToUserLocation = useCallback(
    (loc: LatLng | null = userLocation) => {
      if (!loc) return false;
      mapRef.current?.recenter(loc.latitude, loc.longitude, LOCATE_FAB_ZOOM, { animate: true });
      return true;
    },
    [userLocation]
  );

  const handleSwitchMapViewMode = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    const next: PilgrimageMapViewMode = mapViewMode === 'myLocation' ? 'anime' : 'myLocation';
    persistMapViewMode(next);
    if (next === 'myLocation') {
      if (!flyToUserLocation()) requestPermissionSheet();
    }
  }, [flyToUserLocation, mapViewMode, persistMapViewMode, requestPermissionSheet]);

  const handleAllowLocationFromSheet = useCallback(() => {
    dismissPermissionSheet();
    persistMapViewMode('myLocation');
    cycleState();
  }, [cycleState, dismissPermissionSheet, persistMapViewMode]);

  // ─── Bottom-sheet anchor plumbing ──────────────────────────────────────
  const screenHeight = Dimensions.get('window').height;
  const sheetPosition = useSharedValue(screenHeight);

  const sheetPeekOffset = useMemo(() => {
    return Math.max(
      VIEW_MODE_TOGGLE_HEIGHT + insets.bottom + 12,
      Math.round(SHEET_PEEK_FRACTION * screenHeight) + 12
    );
  }, [insets.bottom, screenHeight]);

  const initialSheetIndex = initialMode === 'list' ? 2 : 1;

  // Anchor floating bottom chrome to the sheet's top edge so it slides with
  // the sheet rather than getting buried at mid snap. Hidden once the sheet
  // covers the top half of the screen (full snap) so it doesn't float over
  // the anime list scroll area.
  const chromeAnimatedStyle = useAnimatedStyle(() => {
    const bottom = Math.max(screenHeight - sheetPosition.value + 6, sheetPeekOffset);
    const hidden = sheetPosition.value < screenHeight * 0.18;
    return {
      bottom,
      opacity: hidden ? 0 : 1,
    };
  });

  // ─── Drive the inline map camera (Rule 9 — imperative, off React state) ──
  // Fly to the focused anime when it changes (swap / sheet-row preview) so the
  // sheet + map track together. This is a programmatic camera move driven by
  // content focus, not the user — pause follow first (I5, Google Maps
  // convention: focusing content breaks "follow me").
  useEffect(() => {
    if (mapViewMode !== 'anime') return;
    const anime = focusedAnime?.anime;
    if (anime && isValidGeo(anime.geo)) {
      onUserPan();
      mapRef.current?.focus?.({ lat: anime.geo[0], lng: anime.geo[1], zoom: 11 });
    }
  }, [focusedAnime, mapViewMode, onUserPan]);

  // NOTE: there used to be a `mapViewMode === 'myLocation' && userLocation`
  // effect here that recentred on every location tick. With the T6 always-on
  // watcher that fired on every fix and fought any pan the user made while
  // following, bypassing the follow state machine entirely. The follow
  // machine already owns continuous recentring (`onFollowLocation` above);
  // `handleSwitchMapViewMode` (above) does the one-shot recenter when the
  // user explicitly switches TO myLocation. Do not re-add a myLocation-driven
  // recenter effect here.

  useEffect(() => {
    if (loading || autoPermissionPromptedRef.current) return;
    if (locatePermission === 'granted' || userLocation) return;
    const timer = setTimeout(() => {
      autoPermissionPromptedRef.current = true;
      requestPermissionSheet();
    }, 1000);
    return () => clearTimeout(timer);
  }, [loading, locatePermission, requestPermissionSheet, userLocation]);

  // Fly to a region's bounds on a region-chip tap. `flyBoundsRequest` gets a
  // fresh identity per tap so re-taps re-run this. Programmatic camera move —
  // pause follow first (I5) so a region pick doesn't fight the follow state.
  useEffect(() => {
    if (!flyBoundsRequest) return;
    onUserPan();
    mapRef.current?.fitBounds?.(flyBoundsRequest.bounds);
  }, [flyBoundsRequest, onUserPan]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background.primary },
        }}
      />
      {/* root is box-none so empty-map taps fall through the overlays to the
          full-bleed native map beneath; the search pill / region chips / bottom
          chrome / FABs / sheet stay real hit targets. */}
      <View style={styles.root} pointerEvents="box-none">
        {/* Layer 1 — the native map, inline. Rendered directly in this screen
            (not a portal) so it stays warm across hub→detail→back and is hidden
            correctly by the navigator when detail covers it — a native GL
            surface can't be hidden by opacity, which is why the old portal
            layer bled through on back-navigation. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          <MapSurface
            key={mapReloadKey}
            ref={mapRef}
            markers={markers}
            styleUrl={styleUrl}
            user={userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null}
            center={initialView.center}
            zoom={initialView.zoom}
            clusterDisableAtZoom={CLUSTER_DISABLE_AT.hub}
            onMarkerPress={(m) => {
              if (m.bangumiId != null) handleMarkerPress(m.bangumiId);
            }}
            onMarkerLongPress={handleMarkerLongPress}
            onClusterPress={handleClusterPress}
            onBoundsChange={handleMapBoundsChange}
            onPanned={onUserPan}
            onLoadError={handleMapLoadError}
            onLoadSuccess={handleMapLoadSuccess}
          />
        </View>

        {mapLoadFailed ? <MapOfflineOverlay onRetry={handleMapRetry} /> : null}

        {loading ? (
          <View style={styles.loadingBox}>
            <Skeleton.MapList mapHeight={400} listCount={4} />
          </View>
        ) : (
          <>
            {/* Layer 2 — floating top overlay (back / album + search + region chips). */}
            <View style={styles.topOverlay} pointerEvents="box-none">
              <View style={styles.headerActions}>
                <RoundHeaderButton
                  icon="chevron-back"
                  onPress={handleBack}
                  accessibilityLabel={t('common.back')}
                  tint={theme.text.primary}
                  theme={theme}
                />
                <View style={styles.headerRightGroup}>
                  <RoundHeaderButton
                    icon={mapViewMode === 'myLocation' ? 'film-outline' : 'location'}
                    onPress={handleSwitchMapViewMode}
                    accessibilityLabel={
                      mapViewMode === 'myLocation'
                        ? t('pilgrimage.map.viewModeAnime')
                        : t('pilgrimage.map.viewModeMyLocation')
                    }
                    tint={themeColor}
                    theme={theme}
                  />
                  <RoundHeaderButton
                    icon="albums-outline"
                    onPress={handleOpenAlbum}
                    accessibilityLabel={t('pilgrimage.map.openAlbumA11y')}
                    tint={themeColor}
                    theme={theme}
                  />
                  <RoundHeaderButton
                    icon="camera-outline"
                    onPress={handleOpenCamera}
                    accessibilityLabel={t('pilgrimage.capture.entryA11y')}
                    tint={themeColor}
                    theme={theme}
                  />
                </View>
              </View>

              <View style={styles.searchPill}>
                <Ionicons name="search" size={16} color={theme.text.tertiary} />
                <TextInput
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  placeholder={t('pilgrimage.map.searchPlaceholder')}
                  placeholderTextColor={theme.text.tertiary}
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                  selectionColor={themeColor}
                  clearButtonMode="never"
                  accessibilityLabel={t('pilgrimage.map.searchA11y')}
                  style={[styles.searchInput, { color: theme.text.primary }]}
                />
                {searchQuery.length > 0 ? (
                  <Pressable
                    onPress={handleSearchClear}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('pilgrimage.map.clearSearchA11y')}
                    style={({ pressed }) => [styles.searchClearBtn, pressed && { opacity: 0.7 }]}>
                    <Ionicons name="close-circle" size={18} color={theme.text.tertiary} />
                  </Pressable>
                ) : null}
              </View>

              <RegionChipStrip
                theme={theme}
                selectedRegions={selectedRegions}
                onPickRegion={handlePickRegion}
                onResetToJapan={handleResetToJapan}
              />
            </View>

            {/* Layer 3+4 — floating bottom chrome anchored to the sheet's top
              edge. Filter chips + layout toggle in a single Animated.View. */}
            <Animated.View
              style={[styles.bottomChromeWrap, chromeAnimatedStyle]}
              pointerEvents="box-none">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}>
                <FilterPill
                  label={t('pilgrimage.map.filter.all')}
                  active={hubFilter === 'all'}
                  badge={filterCounts.all}
                  themeColor={themeColor}
                  themeColorFg={themeColorFg}
                  theme={theme}
                  onPress={() => handlePickFilter('all')}
                />
                <FilterPill
                  label={t('pilgrimage.map.filter.collection')}
                  active={hubFilter === 'collection'}
                  badge={filterCounts.collection}
                  themeColor={themeColor}
                  themeColorFg={themeColorFg}
                  theme={theme}
                  icon="bookmark"
                  onPress={() => handlePickFilter('collection')}
                />
                <FilterPill
                  label={t('pilgrimage.map.filter.official88')}
                  active={hubFilter === 'official88'}
                  badge={filterCounts.official88}
                  themeColor={themeColor}
                  themeColorFg={themeColorFg}
                  theme={theme}
                  onPress={() => handlePickFilter('official88')}
                />
              </ScrollView>
              <View style={styles.viewModeWrapInner}>
                <View style={styles.viewModeBar}>
                  <LayoutToggleSegment
                    icon="reorder-three"
                    label={t('pilgrimage.map.layout.rows')}
                    count={filteredEntries.length}
                    active={listLayout === 'rows'}
                    themeColor={themeColor}
                    themeColorFg={themeColorFg}
                    theme={theme}
                    styles={styles}
                    onPress={() => handlePickLayout('rows')}
                  />
                  <LayoutToggleSegment
                    icon="apps"
                    label={t('pilgrimage.map.layout.grid')}
                    count={filteredEntries.length}
                    active={listLayout === 'grid'}
                    themeColor={themeColor}
                    themeColorFg={themeColorFg}
                    theme={theme}
                    styles={styles}
                    onPress={() => handlePickLayout('grid')}
                  />
                </View>
              </View>
            </Animated.View>

            {/* Locate FAB — anchors to the sheet so it never sits behind the
              handle, and drives idle / following / compass via the hook. */}
            <LocateFab
              state={locateState}
              onPress={cycleState}
              sheetAnimatedPosition={sheetPosition}
              screenHeight={screenHeight}
              bottomInset={sheetPeekOffset}
              loading={isRequestingPermission}
            />

            {/* Layer 5 — persistent pull-up sheet with focused-anime card,
              hub stats and the nearby anime list. */}
            <PilgrimageHubSheet
              nearbyAnimes={filteredEntries}
              focusedAnime={focusedAnime}
              canSwap={filteredEntries.length > 1}
              stats={stats}
              listLayout={listLayout}
              themeColor={themeColor}
              themeColorFg={themeColorFg}
              theme={theme}
              searchQuery={searchQuery}
              filterMode={hubFilter}
              onGoToCollection={handleGoToCollection}
              initialIndex={initialSheetIndex}
              animatedPosition={sheetPosition}
              onAnimePress={handleSheetAnimePress}
              onSwapFocused={handleSwapFocused}
              nearbySpots={nearbySpots}
              onPickNearbySpot={handlePickNearbySpot}
            />

            {/* Long-press quick actions — anime-centroid honest actions only
              (navigate / open detail). See Rule 8 note above handlers. */}
            <Modal
              transparent
              visible={quickActionMarker != null}
              onRequestClose={closeQuickActions}
              statusBarTranslucent
              animationType="fade">
              <Pressable
                style={styles.quickActionBackdrop}
                onPress={closeQuickActions}
                accessibilityLabel={t('commonUi.dismiss')}
                accessibilityRole="button">
                <Pressable
                  style={[
                    styles.quickActionSheet,
                    { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
                  ]}
                  onPress={() => undefined}>
                  <ThemedText variant="titleSmall" weight="800" numberOfLines={1}>
                    {quickActionMarker?.title}
                  </ThemedText>
                  <Pressable
                    onPress={handleQuickNavigate}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.quickActionRow, pressed && { opacity: 0.7 }]}>
                    <Ionicons name="navigate-outline" size={18} color={theme.text.primary} />
                    <ThemedText variant="bodyMedium">
                      {t('pilgrimage.map.quickAction.navigate')}
                    </ThemedText>
                  </Pressable>
                  {quickActionMarker?.bangumiId != null ? (
                    <Pressable
                      onPress={handleQuickOpen}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.quickActionRow, pressed && { opacity: 0.7 }]}>
                      <Ionicons name="information-circle-outline" size={18} color={theme.text.primary} />
                      <ThemedText variant="bodyMedium">
                        {t('pilgrimage.map.quickAction.openDetail')}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </Pressable>
              </Pressable>
            </Modal>
          </>
        )}

        {/* Permanently-denied permission sheet. Lives outside the loading
          branch so dismissing it during a re-render doesn't unmount it
          mid-animation. */}
        <LocationPermissionSheet
          visible={permissionSheetVisible}
          onDismiss={dismissPermissionSheet}
          title={t('pilgrimage.map.locationPromptTitle')}
          body={t('pilgrimage.map.locationPromptBody')}
          primaryLabel={
            locatePermission === 'blocked'
              ? t('pilgrimage.map.locationPromptOpenSettings')
              : t('pilgrimage.map.locationPromptAllow')
          }
          secondaryLabel={t('pilgrimage.map.locationPromptNotNow')}
          onPrimaryPress={locatePermission === 'blocked' ? undefined : handleAllowLocationFromSheet}
        />
      </View>
    </>
  );
}

// Small segmented button used in the floating Grid/Rows toggle. Inlined
// because it's specific to this route's chrome — a separate file would be
// more import noise than the local component is worth.
interface LayoutToggleSegmentProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  count: number;
  active: boolean;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}

function LayoutToggleSegment({
  icon,
  label,
  count,
  active,
  themeColor,
  themeColorFg,
  theme,
  styles,
  onPress,
}: LayoutToggleSegmentProps) {
  const fg = active ? themeColorFg : theme.text.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.viewModeSegment,
        active ? { backgroundColor: themeColor } : { backgroundColor: 'transparent' },
        pressed && { opacity: 0.86 },
      ]}>
      <Ionicons name={icon} size={14} color={fg} />
      <ThemedText variant="bodySmall" weight="700" style={{ color: fg }}>
        {label}
      </ThemedText>
      <View
        style={[
          styles.viewModeSegmentBadge,
          active
            ? { backgroundColor: `${themeColorFg}22` }
            : { backgroundColor: theme.background.tertiary },
        ]}>
        <ThemedText variant="captionSmall" weight="700" style={{ color: fg }}>
          {count}
        </ThemedText>
      </View>
    </Pressable>
  );
}
// Region chip strip — embedded inside the floating top overlay (so it sits
// just under the search pill). Camera-only: tapping a region flies the map.
// The "what to show" filter (collection / 88) is owned by the bottom chrome.
interface RegionChipStripProps {
  theme: ThemePalette;
  selectedRegions: ReadonlySet<AnimeTourism88Region>;
  onPickRegion: (region: AnimeTourism88Region) => void;
  onResetToJapan: () => void;
}

function RegionChipStrip({
  theme,
  selectedRegions,
  onPickRegion,
  onResetToJapan,
}: RegionChipStripProps) {
  const t = useT();
  const chipStyles = useMemo(() => makeChipStyles(theme), [theme]);
  const wholeJapanActive = selectedRegions.size === 0;
  const accentFg = readableTextOn(theme.accent);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={chipStyles.scroll}>
      <Pressable
        onPress={onResetToJapan}
        accessibilityRole="button"
        accessibilityLabel={t('pilgrimage.map.wholeJapanA11y')}
        accessibilityState={{ selected: wholeJapanActive }}
        style={({ pressed }) => [
          chipStyles.chip,
          chipStyles.chipRow,
          wholeJapanActive ? { backgroundColor: theme.accent, borderColor: theme.accent } : null,
          pressed && { opacity: 0.85 },
        ]}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          style={[chipStyles.chipLabel, wholeJapanActive ? { color: accentFg } : null]}>
          {t('pilgrimage.map.allJapan')}
        </ThemedText>
        {/* When regions are picked, the All chip doubles as a clear-all (× ). */}
        {!wholeJapanActive ? (
          <Ionicons name="close-circle" size={13} color={theme.text.tertiary} />
        ) : null}
      </Pressable>
      {ANIME_TOURISM_88_REGIONS.map((r) => {
        const active = selectedRegions.has(r);
        return (
          <Pressable
            key={r}
            onPress={() => onPickRegion(r)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              chipStyles.chip,
              active ? { backgroundColor: theme.accent, borderColor: theme.accent } : null,
              pressed && { opacity: 0.85 },
            ]}>
            <ThemedText
              variant="captionSmall"
              weight="600"
              style={[chipStyles.chipLabel, active ? { color: accentFg } : null]}>
              {t(REGION_LABEL_KEY[r])}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function makeChipStyles(theme: ThemePalette) {
  return StyleSheet.create({
    scroll: {
      gap: 8,
      paddingVertical: 2,
      paddingRight: Spacing.xs,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: `${theme.background.primary}E6`,
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    chipLabel: {
      ...Typography.captionSmall,
      color: theme.text.primary,
    },
  });
}

function makeStyles(theme: ThemePalette, topInset: number) {
  return StyleSheet.create({
    // Transparent so the inline full-bleed native map remains visible behind
    // overlays. Combined with pointerEvents="box-none" on the root View,
    // empty-map taps reach the map. The loading skeleton keeps an opaque bg
    // while the native map preloads behind it.
    root: { flex: 1, backgroundColor: 'transparent' },
    loadingBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
      backgroundColor: theme.background.primary,
    },

    // Floating top overlay (back/album row + search + region chips).
    // Mirrors the detail screen's topOverlay style for shell continuity.
    topOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingTop: topInset + Spacing.xs,
      paddingHorizontal: Spacing.screenPadding,
      gap: Spacing.sm,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerRightGroup: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },

    // In-page search field — sized so the clear-X has comfortable hit area.
    searchPill: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 14,
      paddingRight: 6,
      borderRadius: Radius.full,
      backgroundColor: `${theme.background.secondary}E6`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
    },
    searchInput: {
      flex: 1,
      minHeight: 42,
      paddingVertical: 0,
      ...Typography.bodyMedium,
      letterSpacing: 0,
    },
    searchClearBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Floating bottom chrome — anchored to the sheet's top edge.
    bottomChromeWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingHorizontal: Spacing.screenPadding,
      gap: Spacing.xs,
    },
    chipRow: {
      gap: Spacing.xs,
      paddingRight: Spacing.xs,
    },
    viewModeWrapInner: {
      alignItems: 'center',
    },
    viewModeBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 4,
      paddingVertical: 4,
      borderRadius: Radius.full,
      backgroundColor: `${theme.background.primary}E0`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
    },
    viewModeSegment: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      height: 36,
      borderRadius: Radius.full,
    },
    viewModeSegmentBadge: {
      minWidth: 24,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Long-press marker quick-action sheet (navigate / open detail).
    quickActionBackdrop: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.35)',
      padding: 16,
    },
    quickActionSheet: {
      borderRadius: Radius.lg,
      borderWidth: 1,
      padding: 16,
      gap: 8,
    },
    quickActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 44,
    },
  });
}
