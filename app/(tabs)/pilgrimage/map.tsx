// Dedicated full-bleed map route. Lives outside the Tabs UI (registered with
// tabBarStyle: display 'none' in app/_layout.tsx) so the bottom dock and the
// hub's top bar both disappear — that's what users mean by "全螢幕".
//
// Pushed from the hub, so back goes back to the hub instead of falling out
// to the previously-selected tab.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { Spacing, Typography } from '../../../constants/DesignSystem';
import { ThemedText, Skeleton } from '../../../components/themed';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../../libs/services/pilgrimage/featured-anime';
import { collectionPilgrimageService } from '../../../libs/services/pilgrimage/collection-pilgrimage-service';
import { locationService, type LatLng } from '../../../libs/services/pilgrimage/location-service';
import {
  ANIME_TOURISM_88_REGIONS,
  get88EntriesWithCoords,
  type AnimeTourism88Region,
  type AnimeTourism88EntryWithCoords,
} from '../../../libs/services/pilgrimage/anime88-repository';
import {
  LEAFLET_CSS,
  LEAFLET_JS,
  LEAFLET_MARKERCLUSTER_CSS,
  LEAFLET_MARKERCLUSTER_JS,
} from '../../../libs/services/pilgrimage/leaflet-assets';
import {
  MAP_BASE_BODY,
  MAP_BASE_CSS,
  MAP_BASE_JS,
  MAP_BASE_URL,
  TILE_ATTRIBUTION,
  TILE_MAX_ZOOM,
  TILE_SUBDOMAINS,
  TILE_URL,
} from '../../../libs/services/pilgrimage/leaflet-map';
import { getNumberParam } from '../../../libs/utils/route-params';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import {
  getAnimeInBounds,
  type AnitabiIndexEntry,
  type BoundingBox,
} from '../../../libs/services/pilgrimage/anitabi-index';

interface HubMapMarker {
  /** Unique within a marker set: "bgm:<id>" for Anitabi-centroid markers, "88:<entryId>" for Tourism 88 city pins. */
  markerId: string;
  bangumiId: number;
  lat: number;
  lng: number;
  cover: string;
  title: string;
  city: string;
  pointsLength: number;
  ringColor: string;
  /** Set when this marker is a Tourism 88 city pin; renders gold with a star overlay. */
  is88?: boolean;
  /** Sequential 88 list id (1..N). Surfaced in the popup. */
  eightyEightId?: number;
}

// 7-region taxonomy from animetourism88.com — Tokyo is split from Kanto.
const REGION_88_LABELS: Record<AnimeTourism88Region, string> = {
  hokkaido_tohoku: '北海道・東北',
  kanto: '関東',
  tokyo: '東京',
  chubu: '中部',
  kinki: '近畿',
  chugoku_shikoku: '中国・四国',
  kyushu_okinawa: '九州・沖縄',
};

// Geographic bounding boxes for each region. Hand-tuned to feel like a
// regional view (not a city zoom): a region tap should let the user see "the
// whole Kanto / whole Kyushu" before they drill into a specific anime.
// Tokyo Metro is the 23-ward area so it stays distinct from the wider Kanto.
interface RegionBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}
const REGION_BOUNDS: Record<AnimeTourism88Region, RegionBounds> = {
  hokkaido_tohoku: { south: 37.0, west: 139.4, north: 45.6, east: 146.0 },
  kanto: { south: 35.0, west: 138.7, north: 37.0, east: 141.0 },
  tokyo: { south: 35.5, west: 139.3, north: 35.9, east: 140.0 },
  chubu: { south: 34.6, west: 136.0, north: 38.0, east: 139.5 },
  kinki: { south: 33.5, west: 134.2, north: 35.8, east: 136.5 },
  chugoku_shikoku: { south: 32.5, west: 130.7, north: 35.7, east: 134.5 },
  kyushu_okinawa: { south: 24.0, west: 122.9, north: 34.5, east: 132.0 },
};

// Whole-archipelago framing: centre on the Sea of Japan side of central
// Honshu so Hokkaido and Okinawa both stay on-screen at zoom 5.
const JAPAN_OVERVIEW = { lat: 36.5, lng: 138.0, zoom: 5 } as const;

// Whole-Japan bounding box — south of Yonaguni to north of Hokkaido.
// Used when the user taps the "全日本" reset chip.
const JAPAN_BOUNDS: RegionBounds = {
  south: 24.0,
  west: 122.9,
  north: 45.6,
  east: 146.0,
};

// Eighty-eight selection mark colour — picked for "official certification"
// connotation (vs. theme.accent which can drift between user themes).
const OFFICIAL_88_GOLD = '#D4AF37';

function build88Markers(
  entries: readonly AnimeTourism88EntryWithCoords[]
): HubMapMarker[] {
  const out: HubMapMarker[] = [];
  for (const e of entries) {
    const bangumi = e.externalIds.bangumi;
    if (typeof bangumi !== 'number') continue;
    out.push({
      markerId: `88:${e.id}`,
      bangumiId: bangumi,
      lat: e.lat,
      lng: e.lng,
      cover: '',
      title: e.titleEn || e.titleJa,
      city: `${e.prefecture ?? ''}${e.city}`,
      pointsLength: 0,
      ringColor: OFFICIAL_88_GOLD,
      is88: true,
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

function buildHubMapHtml(initial: {
  center: { lat: number; lng: number; zoom: number };
  user: { lat: number; lng: number } | null;
  ringColor: string;
}): string {
  const initialJson = JSON.stringify(initial).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>${LEAFLET_CSS}</style>
<style>${LEAFLET_MARKERCLUSTER_CSS}</style>
<style>${MAP_BASE_CSS}</style>
<style>
  .anime-marker {
    width: 44px; height: 44px; border-radius: 12px;
    border: 2px solid var(--ring, #FF9F0A);
    background: #1c1c1e; overflow: hidden; position: relative;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 6px 14px rgba(0,0,0,0.45);
    transition: transform .15s ease;
  }
  .anime-marker:active { transform: scale(0.92); }
  .anime-marker img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .anime-marker .pts {
    position: absolute; bottom: -6px; right: -8px;
    background: #1c1c1e; color: #fff;
    border: 2px solid var(--ring, #FF9F0A);
    border-radius: 8px; padding: 1px 5px;
    font: 700 9px -apple-system, system-ui, sans-serif;
    line-height: 1.2;
  }
  /* Tourism 88 official-selection pins: smaller, gold, with a star plate. */
  .anime-marker.eighty-eight {
    width: 32px; height: 32px; border-radius: 16px;
    border-width: 3px;
    background: ${OFFICIAL_88_GOLD};
    color: #1c1c1e;
    font: 800 16px -apple-system, system-ui, sans-serif;
  }
  .anime-marker.eighty-eight .star { line-height: 1; }
  .anime-marker.eighty-eight .pts { display: none; }
  .anime-marker.eighty-eight .eighty-id {
    position: absolute; bottom: -7px; right: -10px;
    background: #1c1c1e; color: ${OFFICIAL_88_GOLD};
    border: 1.5px solid ${OFFICIAL_88_GOLD};
    border-radius: 7px; padding: 1px 4px;
    font: 700 9px -apple-system, system-ui, sans-serif;
    line-height: 1.2;
  }
</style>
</head>
<body>
${MAP_BASE_BODY}
<script>${LEAFLET_JS}</script>
<script>${LEAFLET_MARKERCLUSTER_JS}</script>
<script>${MAP_BASE_JS}</script>
<script>
(function(){
  var initial = ${initialJson};
  var map = L.map('map', { zoomControl: false, attributionControl: true, fadeAnimation: true })
    .setView([initial.center.lat, initial.center.lng], initial.center.zoom);
  new window.CachedTileLayer(${JSON.stringify(TILE_URL)}, {
    maxZoom: ${TILE_MAX_ZOOM}, minZoom: 3,
    subdomains: ${JSON.stringify(TILE_SUBDOMAINS)},
    attribution: ${JSON.stringify(TILE_ATTRIBUTION)},
    keepBuffer: 4, updateWhenIdle: false
  }).addTo(map);

  // See index.tsx for the rationale behind the post-mount user pin update.
  var userMarker = null;
  var didSnapToUser = false;
  function applyUser(user) {
    if (userMarker) { try { map.removeLayer(userMarker); } catch (e) {} userMarker = null; }
    if (user && typeof user.lat === 'number' && typeof user.lng === 'number') {
      var userIcon = L.divIcon({ className: '', html: '<div class="user-pulse"></div>', iconSize: [16,16], iconAnchor: [8,8] });
      userMarker = L.marker([user.lat, user.lng], { icon: userIcon, interactive: false, keyboard: false }).addTo(map);
      // First time we get a real location fix, snap the camera to a tight
      // ~10 km-wide framing around the user. Permission usually resolves
      // after the WebView is up, so we can't just rely on the initial
      // setView. We don't repeat this on subsequent updates — the user is
      // already framed; rough GPS noise shouldn't yank the map around.
      if (!didSnapToUser) {
        didSnapToUser = true;
        try { map.flyTo([user.lat, user.lng], 13, { duration: 0.4 }); } catch (e) {}
      }
    }
    initial.user = user;
  }
  applyUser(initial.user);
  window.__updateUser = applyUser;

  var initialCenter = L.latLng(initial.center.lat, initial.center.lng);
  var initialZoom = initial.center.zoom;
  var lastBounds = null;
  window.__bindMap(map, function recenter() {
    if (initial.user) {
      var did = window.__fitNearby(map, initial.user, null, {
        zoom: 14,
        home: { lat: initial.center.lat, lng: initial.center.lng, zoom: initial.center.zoom },
      });
      if (did) return;
    }
    if (lastBounds) {
      try { map.flyToBounds(lastBounds, { padding: [40, 40], maxZoom: 11, duration: 0.4 }); return; } catch (e) {}
    }
    map.flyTo(initialCenter, initialZoom, { duration: 0.4 });
  });

  var clusterLayer = window.__makeClusterGroup({ ringColor: initial.ringColor, disableAt: 12 });
  clusterLayer.addTo(map);

  // Dedup so we can call __updateMarkers(union) repeatedly without
  // re-rendering existing markers. The map-bounds lazy loader appends new
  // entries to the same state and re-injects the full union every change;
  // additive handling here avoids flicker and unnecessary DOM churn.
  //
  // markerId is "bgm:<bangumi>" for Anitabi-centroid pins and "88:<entryId>"
  // for Tourism 88 city pins — that lets one anime carry multiple 88 markers
  // (e.g. ゆるキャン△ has 6 cities) without collapsing.
  var loadedIds = new Set();
  var allBounds = [];

  // When the React side toggles a filter (Official 88 / region) it injects
  // with replace=true so we wipe and rebuild instead of accumulating stale
  // markers from the previous filter set.
  window.__updateMarkers = function(markers, replace) {
    if (replace) {
      try { clusterLayer.clearLayers(); } catch (e) {}
      loadedIds = new Set();
      allBounds = [];
    }
    var batch = [];
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var mid = m.markerId || ('bgm:' + m.bangumiId);
      if (loadedIds.has(mid)) continue;
      loadedIds.add(mid);
      (function(m, mid){
        var cls = 'anime-marker' + (m.is88 ? ' eighty-eight' : '');
        var inner;
        if (m.is88) {
          inner = '<span class="star">★</span>' +
            '<span class="eighty-id">#' + (m.eightyEightId || '?') + '</span>';
        } else {
          inner = (m.cover ? '<img src="' + m.cover + '" loading="lazy" />' : '') +
            '<span class="pts">' + m.pointsLength + '</span>';
        }
        var size = m.is88 ? 32 : 44;
        var html = '<div class="' + cls + '" style="--ring:' + m.ringColor + '">' + inner + '</div>';
        var icon = L.divIcon({ className: '', html: html, iconSize: [size, size], iconAnchor: [size/2, size/2] });
        var marker = L.marker([m.lat, m.lng], { icon: icon, regionColor: m.ringColor });
        marker.__appId = m.bangumiId;
        marker.on('click', function() {
          window.__post({ type: 'animePress', id: m.bangumiId, is88: !!m.is88, eightyEightId: m.eightyEightId || null });
        });
        batch.push(marker);
        allBounds.push([m.lat, m.lng]);
      })(m, mid);
    }
    if (batch.length === 0 && !replace) return;
    if (typeof clusterLayer.addLayers === 'function') clusterLayer.addLayers(batch);
    else for (var k = 0; k < batch.length; k++) clusterLayer.addLayer(batch[k]);

    if (allBounds.length > 0) {
      try { lastBounds = L.latLngBounds(allBounds); } catch (e) { /* noop */ }
    }
    // Do NOT auto fit-to-all-markers. Pilgrimage points span the whole
    // archipelago — fitting them all dropped the camera to ~zoom 6 (a
    // country map), which made the screen feel like an atlas instead of
    // "what's around me". We keep the initial setView (user → zoom 13 via
    // applyUser, otherwise Tokyo Station) and let the user pan / hit the
    // recenter button (which uses lastBounds) when they actually want the
    // wider view.
  };

  window.__focusAnime = function(target) {
    if (!target || typeof target.lat !== 'number') return;
    try { map.flyTo([target.lat, target.lng], 11, { duration: 0.6 }); } catch (e) {}
  };

  // Fly the camera to a region (or whole Japan). Pure navigation — does NOT
  // change which markers are visible. The bounds-based lazy loader picks up
  // the markers that fall into the new viewport on its own.
  window.__flyToBounds = function(b) {
    if (!b || typeof b.south !== 'number') return;
    try {
      map.flyToBounds(
        [[b.south, b.west], [b.north, b.east]],
        { padding: [40, 40], maxZoom: 10, duration: 0.6 }
      );
    } catch (e) {}
  };

  // Emit current bounds to RN so it can lazy-load more anime from the
  // offline index. Debounced inside the WebView (300 ms) — Leaflet's
  // moveend fires once per gesture, but pinch-zoom on iOS can chain a
  // few in quick succession.
  var boundsTimer = null;
  function emitBounds() {
    if (boundsTimer) { clearTimeout(boundsTimer); }
    boundsTimer = setTimeout(function() {
      try {
        var b = map.getBounds();
        window.__post({
          type: 'bounds',
          n: b.getNorth(), s: b.getSouth(),
          e: b.getEast(), w: b.getWest(),
        });
      } catch (e) { /* noop */ }
    }, 300);
  }
  map.on('moveend', emitBounds);

  window.__post({ type: 'ready' });
  emitBounds();
})();
</script>
</body>
</html>`;
}

const COLLECTION_BACKFILL_TARGET = 16;

export default function PilgrimageMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const focusBangumiId = getNumberParam(params, 'focus');
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [animes, setAnimes] = useState<AnitabiBangumi[]>([]);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);

  // Same priority as the hub: collection first, featured backfills.
  // anitabiService memoises every fetch, so re-loading here costs ~nothing
  // when the user just came from the hub.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const merged = new Map<number, AnitabiBangumi>();
      try {
        const entries = await collectionPilgrimageService.getEntries();
        for (const e of entries) {
          if (e.anime && !merged.has(e.anime.id)) merged.set(e.anime.id, e.anime);
        }
      } catch (err) {
        console.warn('[PilgrimageMap] collection load failed:', err);
      }

      if (merged.size < COLLECTION_BACKFILL_TARGET) {
        const results = await Promise.allSettled(
          FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
            pilgrimageRepository.getSpotsByBangumiId(bangumiId)
          )
        );
        for (const r of results) {
          if (r.status !== 'fulfilled' || !r.value) continue;
          if (!merged.has(r.value.id)) merged.set(r.value.id, r.value);
        }
      }

      if (cancelled) return;
      const list = [...merged.values()].sort(
        (a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0)
      );
      setAnimes(list);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!cancelled && loc) setUserLocation(loc);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy-loaded entries from the offline index, keyed by bangumi id and
  // additive only (we never remove — the WebView dedups by id so duplicates
  // are cheap, and pan-back-and-forth wants the markers to stay put).
  const [extraIndexed, setExtraIndexed] = useState<Map<number, AnitabiIndexEntry>>(
    () => new Map()
  );

  const handleBoundsChange = useCallback(
    (bounds: BoundingBox) => {
      const seen = new Set<number>();
      for (const a of animes) seen.add(a.id);
      for (const id of extraIndexed.keys()) seen.add(id);
      const next = getAnimeInBounds(bounds, { exclude: seen, limit: 40 });
      if (next.length === 0) return;
      setExtraIndexed((prev) => {
        const merged = new Map(prev);
        for (const entry of next) merged.set(entry.id, entry);
        return merged;
      });
    },
    [animes, extraIndexed]
  );

  // Filter state for the chip row above the map. `null` region == all 7 groups.
  // - `official88Mode`: filter markers to the Anime Tourism 88 selection.
  // - `focusedRegion`: which region's camera framing is active. Tapping a region
  //   ALWAYS flies the camera; if 88 mode is on, it also narrows the filter.
  // - `flyTick`: increments on every region tap so the camera re-flies even
  //   when the user re-taps the chip they're already focused on.
  const [official88Mode, setOfficial88Mode] = useState(false);
  const [focusedRegion, setFocusedRegion] = useState<AnimeTourism88Region | null>(null);
  const [flyTick, setFlyTick] = useState(0);

  const all88WithCoords = useMemo(() => get88EntriesWithCoords(), []);

  const baseAnitabiMarkers = useMemo<HubMapMarker[]>(() => {
    const out: HubMapMarker[] = [];
    const seen = new Set<number>();
    for (const anime of animes) {
      if (!isValidGeo(anime.geo)) continue;
      seen.add(anime.id);
      out.push({
        markerId: `bgm:${anime.id}`,
        bangumiId: anime.id,
        lat: anime.geo[0],
        lng: anime.geo[1],
        cover: anime.cover ?? '',
        title: anime.cn || anime.title,
        city: anime.city ?? '',
        pointsLength: anime.pointsLength ?? 0,
        ringColor: anime.color || theme.accent,
      });
    }
    for (const entry of extraIndexed.values()) {
      if (seen.has(entry.id)) continue;
      out.push({
        markerId: `bgm:${entry.id}`,
        bangumiId: entry.id,
        lat: entry.lat,
        lng: entry.lng,
        cover: entry.cover,
        title: entry.cn || entry.title,
        city: entry.city,
        pointsLength: entry.pointsLength,
        ringColor: entry.color || theme.accent,
      });
    }
    return out;
  }, [animes, extraIndexed, theme.accent]);

  const markers = useMemo<HubMapMarker[]>(() => {
    if (!official88Mode) return baseAnitabiMarkers;
    const filtered = focusedRegion
      ? all88WithCoords.filter((e) => e.region === focusedRegion)
      : all88WithCoords;
    return build88Markers(filtered);
  }, [official88Mode, focusedRegion, all88WithCoords, baseAnitabiMarkers]);

  // Bumped whenever the filter set fundamentally changes so the WebView can
  // clear stale markers (we re-render gold city pins ↔ anitabi anime centroids).
  const refitNonce = useMemo(
    () => `${official88Mode ? '88' : 'all'}:${focusedRegion ?? 'any'}`,
    [official88Mode, focusedRegion]
  );

  // Camera-fly request derived from focusedRegion + flyTick. Whole-Japan when
  // no region is focused; the region's bounds otherwise. flyTick guarantees a
  // new identity per tap so the FullscreenMapView effect re-runs.
  const flyBoundsRequest = useMemo(() => {
    if (flyTick === 0) return null; // skip initial render — the map already opens at Japan overview
    const bounds = focusedRegion ? REGION_BOUNDS[focusedRegion] : JAPAN_BOUNDS;
    return { key: `${focusedRegion ?? 'jp'}#${flyTick}`, bounds };
  }, [focusedRegion, flyTick]);

  const handlePickRegion = useCallback((region: AnimeTourism88Region) => {
    Haptics.selectionAsync().catch(() => undefined);
    setFocusedRegion((cur) => (cur === region ? null : region));
    setFlyTick((t) => t + 1);
  }, []);

  const handleResetToJapan = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setFocusedRegion(null);
    setFlyTick((t) => t + 1);
  }, []);

  const handleToggleOfficial88 = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setOfficial88Mode((v) => !v);
  }, []);

  const handleAnimePress = useCallback(
    (bangumiId: number) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(`/pilgrimage/${bangumiId}`);
    },
    [router]
  );

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {loading ? (
        <View style={styles.loadingBox}>
          <Skeleton.MapList mapHeight={400} listCount={4} />
        </View>
      ) : markers.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="map-outline" size={32} color={theme.text.tertiary} />
          <ThemedText variant="bodyMedium" tone="secondary" align="center">
            No anime with mapped pilgrimage locations yet.
          </ThemedText>
        </View>
      ) : (
        <>
          <FullscreenMapView
            markers={markers}
            replaceKey={refitNonce}
            userLocation={userLocation}
            ringColor={theme.accent}
            theme={theme}
            focusBangumiId={focusBangumiId}
            flyBoundsRequest={flyBoundsRequest}
            onAnimePress={handleAnimePress}
            onBoundsChange={handleBoundsChange}
          />
          <FilterChipRow
            theme={theme}
            insetTop={insets.top}
            official88Mode={official88Mode}
            focusedRegion={focusedRegion}
            onToggleOfficial88={handleToggleOfficial88}
            onPickRegion={handlePickRegion}
            onResetToJapan={handleResetToJapan}
          />
        </>
      )}

      <Pressable
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={({ pressed }) => [
          styles.backFab,
          { top: insets.top + 12, backgroundColor: `${theme.background.primary}E0` },
          pressed && { opacity: 0.8 },
        ]}>
        <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
      </Pressable>
    </View>
  );
}

interface FullscreenMapViewProps {
  markers: readonly HubMapMarker[];
  /** Bump when the marker set transitions to a different filter view; triggers a clear+rebuild. */
  replaceKey: string;
  userLocation: LatLng | null;
  ringColor: string;
  theme: ThemePalette;
  focusBangumiId: number | null;
  /** When set, fly the camera to this bounding box. The key changes each time so re-tapping the same region re-flies. */
  flyBoundsRequest: { key: string; bounds: RegionBounds } | null;
  onAnimePress: (bangumiId: number) => void;
  onBoundsChange: (bounds: BoundingBox) => void;
}

function FullscreenMapView({
  markers,
  replaceKey,
  userLocation,
  ringColor,
  theme,
  focusBangumiId,
  flyBoundsRequest,
  onAnimePress,
  onBoundsChange,
}: FullscreenMapViewProps) {
  const webviewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const lastReplaceKey = useRef(replaceKey);

  const html = useMemo(() => {
    // Default to a whole-Japan framing so the user can pick a region before
    // drilling into a city. applyUser() still snaps to the user's location
    // at zoom 13 the first time GPS resolves — so locals don't have to pan
    // back. The region chips fly the camera into specific regions on demand.
    const center = { lat: JAPAN_OVERVIEW.lat, lng: JAPAN_OVERVIEW.lng, zoom: JAPAN_OVERVIEW.zoom };
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    return buildHubMapHtml({ center, user, ringColor });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const replace = lastReplaceKey.current !== replaceKey;
    lastReplaceKey.current = replaceKey;
    const json = JSON.stringify(markers).replace(/</g, '\\u003c');
    webviewRef.current.injectJavaScript(`
      try { window.__updateMarkers && window.__updateMarkers(${json}, ${replace ? 'true' : 'false'}); } catch(e) {}
      true;
    `);
  }, [markers, replaceKey, ready]);

  // Push user-location updates so the locate-me bounds-fit works for users
  // who only grant permission after mount.
  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const payload = userLocation
      ? JSON.stringify({ lat: userLocation.latitude, lng: userLocation.longitude })
      : 'null';
    webviewRef.current.injectJavaScript(`
      try { window.__updateUser && window.__updateUser(${payload}); } catch(e) {}
      true;
    `);
  }, [userLocation, ready]);

  useEffect(() => {
    if (!ready || !webviewRef.current || focusBangumiId === null) return;
    const target = markers.find((m) => m.bangumiId === focusBangumiId);
    if (!target) return;
    const payload = JSON.stringify({ lat: target.lat, lng: target.lng });
    webviewRef.current.injectJavaScript(`
      try { window.__focusAnime && window.__focusAnime(${payload}); } catch(e) {}
      true;
    `);
  }, [focusBangumiId, ready, markers]);

  // Region/Japan camera fly. Re-running on `key` lets the user re-tap the
  // same region chip and have the camera re-frame (useful after pan/zoom).
  useEffect(() => {
    if (!ready || !webviewRef.current || !flyBoundsRequest) return;
    const payload = JSON.stringify(flyBoundsRequest.bounds);
    webviewRef.current.injectJavaScript(`
      try { window.__flyToBounds && window.__flyToBounds(${payload}); } catch(e) {}
      true;
    `);
  }, [flyBoundsRequest, ready]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type: string;
        id?: number;
        n?: number;
        s?: number;
        e?: number;
        w?: number;
      };
      if (data.type === 'ready') {
        setReady(true);
        return;
      }
      if (data.type === 'animePress' && typeof data.id === 'number') {
        onAnimePress(data.id);
        return;
      }
      if (
        data.type === 'bounds' &&
        typeof data.n === 'number' &&
        typeof data.s === 'number' &&
        typeof data.e === 'number' &&
        typeof data.w === 'number'
      ) {
        onBoundsChange({ north: data.n, south: data.s, east: data.e, west: data.w });
      }
    } catch {
      // ignore
    }
  };

  return (
    <WebView
      ref={webviewRef}
      originWhitelist={['*']}
      source={{ html, baseUrl: MAP_BASE_URL }}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      cacheMode={Platform.OS === 'android' ? 'LOAD_DEFAULT' : undefined}
      allowsInlineMediaPlayback
      androidLayerType="hardware"
      onMessage={handleMessage}
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.background.primary }]}
      renderError={() => (
        <View style={[StyleSheet.absoluteFill, styles.loadingBox]}>
          <Ionicons name="map-outline" size={32} color={theme.text.secondary} />
          <ThemedText variant="bodyMedium" tone="secondary" align="center">
            Couldn&apos;t load the map.
          </ThemedText>
        </View>
      )}
      startInLoadingState
    />
  );
}

interface FilterChipRowProps {
  theme: ThemePalette;
  insetTop: number;
  /** Whether the Anime Tourism 88 marker filter is enabled. */
  official88Mode: boolean;
  /** Region the camera is focused on (null = whole Japan). */
  focusedRegion: AnimeTourism88Region | null;
  onToggleOfficial88: () => void;
  onPickRegion: (region: AnimeTourism88Region) => void;
  onResetToJapan: () => void;
}

function FilterChipRow({
  theme,
  insetTop,
  official88Mode,
  focusedRegion,
  onToggleOfficial88,
  onPickRegion,
  onResetToJapan,
}: FilterChipRowProps) {
  const chipStyles = useMemo(() => makeChipStyles(theme), [theme]);
  const wholeJapanActive = focusedRegion === null;
  return (
    <View
      pointerEvents="box-none"
      style={[chipStyles.bar, { top: insetTop + 12 }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={chipStyles.scroll}>
        <Pressable
          onPress={onResetToJapan}
          accessibilityRole="button"
          accessibilityLabel="View whole Japan"
          accessibilityState={{ selected: wholeJapanActive }}
          style={({ pressed }) => [
            chipStyles.chip,
            wholeJapanActive
              ? { backgroundColor: theme.accent, borderColor: theme.accent }
              : null,
            pressed && { opacity: 0.85 },
          ]}>
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={[
              chipStyles.chipLabel,
              wholeJapanActive ? { color: theme.background.primary } : null,
            ]}>
            全日本
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={onToggleOfficial88}
          accessibilityRole="button"
          accessibilityState={{ selected: official88Mode }}
          style={({ pressed }) => [
            chipStyles.chip,
            official88Mode
              ? { backgroundColor: OFFICIAL_88_GOLD, borderColor: OFFICIAL_88_GOLD }
              : null,
            pressed && { opacity: 0.85 },
          ]}>
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={[
              chipStyles.chipLabel,
              official88Mode ? { color: '#1c1c1e' } : null,
            ]}>
            ★ 公認 88
          </ThemedText>
        </Pressable>
        {ANIME_TOURISM_88_REGIONS.map((r) => {
          const active = focusedRegion === r;
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
                style={[
                  chipStyles.chipLabel,
                  active ? { color: theme.background.primary } : null,
                ]}>
                {REGION_88_LABELS[r]}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function makeChipStyles(theme: ThemePalette) {
  return StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingLeft: 64,
      paddingRight: Spacing.screenPadding,
    },
    scroll: {
      gap: 8,
      paddingVertical: 4,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: `${theme.background.primary}E6`,
    },
    chipLabel: {
      ...Typography.captionSmall,
      color: theme.text.primary,
    },
  });
}

// Module-scoped styles for the fallback inside FullscreenMapView so the
// component doesn't recompute them on every render.
const styles = StyleSheet.create({
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
  },
});

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    loadingBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
    },
    emptyBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 32,
    },
    backFab: {
      position: 'absolute',
      left: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.glassBorder,
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
  });
}
