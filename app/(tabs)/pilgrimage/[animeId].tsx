// Pilgrimage detail screen.
// Path: /pilgrimage/{bangumiId}
//
// Spec: spec/pilgrimage_spec.md §8 (Routes).
//
// Visual language: map-first. The native map fills the screen as the primary
// surface; back/album/share buttons, the search field, the series switcher and
// the filter chips float on top of the map. A persistent
// pull-up `BottomSheet` hosts the anime info card, stats and scene grid.
// Dragging it up focuses on scenes; dragging it down (or tapping Map)
// focuses on the map. The view-mode toggle (Grid / Rows / Map) controls
// both the sheet content layout and its default snap point.
//
// CLAUDE.md Rule 9: this file is the route shell. State + side effects live
// in feature hooks (usePilgrimageDetailData / Interactions / DerivedSpots /
// SpotSheet) and every leaf is its own memo'd component under
// `components/pilgrimage/detail/`. We do not add new top-level `useState`s
// here without first asking whether the value belongs in a hook or a child.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  InteractionManager,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../context/ThemeContext';
import { ThemedText, readableTextOn } from '../../../components/themed';
import { PLATFORM_CONFIGS, type PlatformType } from '../../../libs/services/auth/types';
import { isSupportedBrowseSource } from '../../../libs/services/data-source-config';
import { getNumberParam } from '../../../libs/utils/route-params';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeTitles,
  getPilgrimageSpotTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';
import {
  getPilgrimageDetailBackRoute,
  getPilgrimageDetailChromeSeed,
} from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import {
  mergePilgrimageSeriesEntries,
  type PilgrimageSeriesSelection,
} from '../../../libs/services/pilgrimage/pilgrimage-series';
import {
  getPilgrimageDetailViewPreset,
  resolvePilgrimageDetailViewPreset,
  type PilgrimageDetailViewPreset,
} from '../../../libs/services/pilgrimage/pilgrimage-detail-flow';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import type { SpotArea } from '../../../libs/services/pilgrimage/spot-areas';
import { nearestUnvisitedWithin } from '../../../libs/services/pilgrimage/proximity-checkin';
import { usePilgrimageDetailView } from '../../../hooks/usePilgrimageDetailView';
import { usePilgrimageDetailData } from '../../../hooks/usePilgrimageDetailData';
import {
  LOCATE_FAB_COMPASS_ZOOM,
  LOCATE_FAB_ZOOM,
  useUserLocationTracking,
} from '../../../libs/services/pilgrimage/use-user-location-tracking';
import { LocateFab } from '../../../components/pilgrimage/LocateFab';
import { LocationPermissionSheet } from '../../../components/pilgrimage/LocationPermissionSheet';
import { usePilgrimageInteractions } from '../../../hooks/usePilgrimageInteractions';
import { usePilgrimageDerivedSpots } from '../../../hooks/usePilgrimageDerivedSpots';
import { usePilgrimageSpotSheet } from '../../../hooks/usePilgrimageSpotSheet';
import {
  FilterCyclePill,
  LayoutModeButton,
  PilgrimageDetailLoadingShell,
  PilgrimageDetailSheet,
  ProximityCheckInBanner,
  RoundHeaderButton,
  SeriesDropdownPill,
  SpotClusterPicker,
  SpotMapView,
  SpotSheet,
  VIEW_MODE_TOGGLE_HEIGHT,
  buildBrowseUrl,
  buildMapsURL,
  getPointSourceBangumiId,
  hasValidGeo,
  makePilgrimageDetailStyles,
  type FilterCyclePillState,
  type SpotMapViewHandle,
} from '../../../components/pilgrimage/detail';
import { useT } from '../../../libs/i18n';

// Sheet snap heights as fractions of the screen — kept in lockstep with the
// snap-points array in PilgrimageDetailSheet. We use them to position the
// floating filter strip and view-mode toggle just above the sheet's peek.
const SHEET_PEEK_FRACTION = 0.16;

// The locate FAB shares the sheet's top edge with the floating chrome
// (filter pill ≈36 + gap 8 + view-mode toggle + its 6px edge offset), so it
// needs a gap tall enough to stack ABOVE that block — the wide 3-segment
// toggle reaches the FAB's right-edge column on phone widths.
const LOCATE_FAB_EDGE_GAP = VIEW_MODE_TOGGLE_HEIGHT + 36 + 8 + 6 + 10;

// Foreground proximity check-in radius (spec 3.5) — distinct from the 150m
// standalone-capture mount radius in nearest-cached-spot.ts (spec 3.2).
const PROXIMITY_RADIUS_METERS = 100;

// First-non-EMPTY fallback (mirrors `firstNonEmpty` in
// pilgrimage-localization.ts, which isn't exported): `??` alone treats a
// present-but-blank `anime.title` as the final value instead of falling
// through to `anime.cn`, which would snapshot an empty intent-meta name.
function firstNonEmptyTitle(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export default function PilgrimageDetailScreen() {
  const params = useLocalSearchParams();
  const bangumiId = getNumberParam(params, 'animeId');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();
  // Frame-1 chrome seed (title / poster / themeColor) carried in by the
  // lister so we can paint hero + accent before any I/O resolves
  // (CLAUDE.md Rule 10). When the real data arrives it replaces the seed.
  const chromeSeed = useMemo(() => getPilgrimageDetailChromeSeed(params), [params]);

  const { view, setView } = usePilgrimageDetailView();
  const {
    seriesSelection,
    viewMode,
    listLayout,
    mapMarkerMode,
    mapOfflineOnly,
    spotFilter,
    spotSearchQuery,
  } = view;

  const resetSeriesSelection = useCallback(() => {
    setView({ seriesSelection: 'all' });
  }, [setView]);
  const { seriesEntries, loading, error, seriesDegraded, browseSource, reload } =
    usePilgrimageDetailData(bangumiId, resetSeriesSelection);

  const availableSeriesEntries = useMemo(
    () => seriesEntries.filter((entry) => entry.anime !== null),
    [seriesEntries]
  );
  const effectiveSeriesSelection = useMemo<PilgrimageSeriesSelection>(() => {
    if (seriesSelection === 'all') return 'all';
    return availableSeriesEntries.some((entry) => entry.subject.id === seriesSelection)
      ? seriesSelection
      : 'all';
  }, [availableSeriesEntries, seriesSelection]);
  const mergedSeries = useMemo(
    () => mergePilgrimageSeriesEntries(availableSeriesEntries, effectiveSeriesSelection),
    [availableSeriesEntries, effectiveSeriesSelection]
  );
  const anime = mergedSeries.anime;
  const points = mergedSeries.points;
  const hasSeriesSwitcher = seriesEntries.length > 1;

  const themeColor = anime?.color || chromeSeed.themeColor || theme.accent;
  const themeColorFg = readableTextOn(themeColor);
  const styles = useMemo(() => makePilgrimageDetailStyles(theme, insets.top), [theme, insets.top]);
  const animeTitles = useMemo(() => (anime ? getPilgrimageAnimeTitles(anime) : null), [anime]);
  const animeSubtitle = animeTitles ? formatPilgrimageSubtitle(animeTitles) : undefined;

  // Tracking hook drives the locate FAB + the map's user dot + cone. The ref
  // points at SpotMapView so location ticks and heading deltas push straight to
  // the map without going through React state (Rule 9).
  const spotMapRef = useRef<SpotMapViewHandle>(null);
  const tracking = useUserLocationTracking({
    onFollowLocation: (loc, fs) => {
      spotMapRef.current?.recenter(
        loc.latitude,
        loc.longitude,
        fs === 'compass' ? LOCATE_FAB_COMPASS_ZOOM : LOCATE_FAB_ZOOM,
        { animate: true }
      );
    },
    onHeadingChange: (deg) => {
      spotMapRef.current?.setHeading(deg);
    },
  });
  const userLocation = tracking.location;
  const interactions = usePilgrimageInteractions();
  const {
    visited,
    spotIntents,
    captures,
    toggleVisitedPoint,
    toggleGroupedVisited,
    toggleSpotIntent,
    hasIntentForGroup,
  } = interactions;

  const derived = usePilgrimageDerivedSpots({
    anime,
    points,
    userLocation,
    visited,
    captures,
    spotIntents,
    spotFilter,
    spotSearchQuery,
    viewMode,
  });
  const {
    groupedSpots,
    groupedSpotByPointId,
    filteredGroupedSpots,
    filteredPoints,
    filteredPointIds,
    filteredMappablePointCount,
    groupedCounts,
    normalizedSpotSearchQuery,
    fallbackSelectedSpotId,
    spotStats,
    userStats,
    distanceFor,
    distanceForGroup,
    representativeForGroup,
  } = derived;

  // Foreground proximity check-in (spec 3.5): when the live location lands
  // within 100m of an unvisited spot, offer a one-tap check-in banner. No
  // background geofence. `userLocation` already updates coarsely (the
  // tracking hook throttles it — Rule 9), and the ref gate below means this
  // effect only ever sets state once per spot per session, never on every
  // GPS tick.
  const promptedSpotIdsRef = useRef<Set<string>>(new Set());
  const [proximityTarget, setProximityTarget] = useState<{
    spot: AnitabiPoint;
    distanceMeters: number;
  } | null>(null);
  useEffect(() => {
    if (!userLocation) return;
    const near = nearestUnvisitedWithin(points, visited, userLocation, PROXIMITY_RADIUS_METERS);
    if (near && !promptedSpotIdsRef.current.has(near.spot.id)) {
      promptedSpotIdsRef.current.add(near.spot.id);
      setProximityTarget({ spot: near.spot, distanceMeters: near.distanceMeters });
    }
  }, [userLocation, points, visited]);
  // The banner targets a specific spot snapshot; if that spot gets checked in
  // some other way while the banner is still up (e.g. the SpotSheet's own
  // 打卡 button), the banner is stale — clear it instead of leaving it to
  // offer a now-wrong action.
  useEffect(() => {
    if (proximityTarget && visited[proximityTarget.spot.id]) {
      setProximityTarget(null);
    }
  }, [proximityTarget, visited]);
  const handleProximityCheckIn = useCallback(() => {
    // Guard against a stale banner: `toggleVisitedPoint` is bidirectional, so
    // if the spot was already checked in elsewhere while the banner sat open,
    // tapping it must not reverse (check OUT) a real visit.
    if (!proximityTarget || visited[proximityTarget.spot.id]) {
      setProximityTarget(null);
      return;
    }
    toggleVisitedPoint(proximityTarget.spot);
    setProximityTarget(null);
  }, [proximityTarget, visited, toggleVisitedPoint]);
  const handleProximityDismiss = useCallback(() => setProximityTarget(null), []);

  const sheet = usePilgrimageSpotSheet({
    groupedSpotByPointId,
    visited,
    captures,
    spotIntents,
    distanceFor,
  });
  const {
    activeSpot,
    clusterSpots,
    selectedSpotId,
    setSelectedSpotId,
    openGroup,
    openSpot,
    openCluster,
    closeSheet,
    closeCluster,
    pickFromCluster,
    activeSpotScenes,
    activeSpotVisitedTarget,
    activeSpotVisited,
    activeSpotSaved,
    activeSpotPlanned,
    activeSpotDistance,
    activeSpotHasCapture,
    activeSpotSceneCount,
  } = sheet;

  // Track the bottom sheet's current snap index so the floating filter strip
  // and view-mode toggle can hide as the sheet covers them. The sheet
  // controls itself; we only react to its onChange to fade the chrome.
  const [sheetIndex, setSheetIndex] = useState<number>(viewMode === 'map' ? 0 : 1);

  useEffect(() => {
    // Keep the floating chrome's "ghost" snap in sync when the user flips
    // the view mode toggle (the sheet itself also snaps via an effect inside
    // PilgrimageDetailSheet).
    setSheetIndex(viewMode === 'map' ? 0 : 1);
  }, [viewMode]);

  // Keep the map's chip-strip selection in sync with the current filtered
  // pointset. If the previous pick was filtered out, fall back to the first
  // valid scene so the strip never lands on a blank chip.
  useEffect(() => {
    setSelectedSpotId((current) => {
      if (viewMode !== 'map' || filteredGroupedSpots.length === 0) {
        return current === null ? current : null;
      }
      return current && filteredPointIds.has(current) ? current : fallbackSelectedSpotId;
    });
  }, [
    viewMode,
    filteredGroupedSpots.length,
    filteredPointIds,
    fallbackSelectedSpotId,
    setSelectedSpotId,
  ]);

  const posterUri = useMemo(() => {
    // Prefer covers we already hold (anitabi CDN / the route-param seed) —
    // they load under every UA. api.bgm.tv's image redirect 403s requests
    // with an `okhttp/*` User-Agent, which is exactly what Android's image
    // pipeline sends, so it blanked the poster on Android whenever it won.
    // Keep it only as the last resort for a bare deep-link id where we have
    // no cover at all (and the poster renders at 84×84, so the h160 anitabi
    // thumbnail is plenty).
    if (anime?.cover) return anime.cover;
    if (chromeSeed.poster) return chromeSeed.poster;
    const posterSubjectId = anime?.id ?? bangumiId;
    if (typeof posterSubjectId === 'number' && posterSubjectId > 0) {
      return `https://api.bgm.tv/v0/subjects/${posterSubjectId}/image?type=large`;
    }
    return '';
  }, [bangumiId, anime?.id, anime?.cover, chromeSeed.poster]);

  const handleOpenMaps = useCallback((spot: AnitabiPoint) => {
    if (!hasValidGeo(spot.geo)) return;
    Haptics.selectionAsync().catch(() => undefined);
    Linking.openURL(buildMapsURL(spot.geo[0], spot.geo[1], spot.name)).catch(() => undefined);
  }, []);

  const handleToggleSaved = useCallback(
    (spot: AnitabiPoint) =>
      toggleSpotIntent(spot, 'saved', groupedSpotByPointId, {
        animeId: anime?.id ?? bangumiId ?? 0,
        name: firstNonEmptyTitle(anime?.title, anime?.cn),
        cn: anime?.cn || undefined,
      }),
    [toggleSpotIntent, groupedSpotByPointId, anime?.id, anime?.title, anime?.cn, bangumiId]
  );
  const handleTogglePlanned = useCallback(
    (spot: AnitabiPoint) =>
      toggleSpotIntent(spot, 'planned', groupedSpotByPointId, {
        animeId: anime?.id ?? bangumiId ?? 0,
        name: firstNonEmptyTitle(anime?.title, anime?.cn),
        cn: anime?.cn || undefined,
      }),
    [toggleSpotIntent, groupedSpotByPointId, anime?.id, anime?.title, anime?.cn, bangumiId]
  );

  const activeViewPreset = getPilgrimageDetailViewPreset(viewMode, listLayout);

  const handleViewPresetChange = useCallback(
    (preset: PilgrimageDetailViewPreset) => {
      Haptics.selectionAsync().catch(() => undefined);
      const next = resolvePilgrimageDetailViewPreset(preset);
      setView({ viewMode: next.viewMode, listLayout: next.listLayout });
    },
    [setView]
  );

  // Rows-mode area section header tap — peek the sheet so the map is
  // dominant, then fit the camera to that area's bounds.
  const handleAreaPress = useCallback(
    (area: SpotArea) => {
      Haptics.selectionAsync().catch(() => undefined);
      setView({ viewMode: 'map' });
      spotMapRef.current?.fitBounds(area.bounds, { animate: true });
    },
    [setView]
  );

  const handleOpenBrowse = useCallback(() => {
    if (!anime) return;
    const url = buildBrowseUrl(browseSource, anime.id);
    if (!url) return;
    Linking.openURL(url).catch(() => undefined);
  }, [anime, browseSource]);

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    const explicitBackRoute = getPilgrimageDetailBackRoute(params);
    if (explicitBackRoute) {
      router.replace(explicitBackRoute);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/pilgrimage');
    }
  }, [params, router]);

  const handleOpenAlbum = useCallback(() => {
    if (bangumiId === null) return;
    Haptics.selectionAsync().catch(() => undefined);
    router.push({ pathname: '/pilgrimage/album', params: { animeId: String(bangumiId) } });
  }, [router, bangumiId]);

  const handleShare = useCallback(() => {
    if (!anime) return;
    Haptics.selectionAsync().catch(() => undefined);
    const url = buildBrowseUrl(browseSource, anime.id) ?? '';
    Share.share({
      message: t('pilgrimage.detail.shareMessage', {
        title: animeTitles?.primary ?? t('pilgrimage.detail.title'),
        count: spotStats.spotCount,
        urlLine: url ? `\n${url}` : '',
      }),
    }).catch(() => undefined);
  }, [anime, animeTitles?.primary, browseSource, spotStats.spotCount, t]);

  const browseLabel = useMemo(() => {
    const platform = isSupportedBrowseSource(browseSource) ? browseSource : 'bangumi';
    return (
      PLATFORM_CONFIGS[platform as PlatformType]?.displayName ??
      t('pilgrimage.detail.browseFallback')
    );
  }, [browseSource, t]);

  const buildCompareParams = useCallback(
    (spot: AnitabiPoint) => {
      const lat = hasValidGeo(spot.geo) ? String(spot.geo[0]) : undefined;
      const lng = hasValidGeo(spot.geo) ? String(spot.geo[1]) : undefined;
      const animeTitle = animeTitles?.primary ?? '';
      const spotTitles = getPilgrimageSpotTitles(spot);
      const sourceBangumiId = getPointSourceBangumiId(spot) ?? bangumiId;
      return {
        spotId: spot.id,
        imageUrl: spot.image,
        name: spotTitles.primary,
        ep: String(spot.ep),
        animeId: sourceBangumiId !== null ? String(sourceBangumiId) : '',
        animeTitle,
        themeColor,
        ...(lat ? { spotLat: lat } : {}),
        ...(lng ? { spotLng: lng } : {}),
        // CC BY-NC-SA 4.0 attribution for the reference screenshot. Both
        // fields are optional; the compare screen reads them via
        // useLocalSearchParams and only renders the credit when origin is set.
        ...(spot.origin ? { sceneOrigin: spot.origin } : {}),
        ...(spot.originURL ? { sceneOriginURL: spot.originURL } : {}),
      };
    },
    [bangumiId, animeTitles?.primary, themeColor]
  );

  // Phase 3: close the sheet first, then push the route after the dismiss
  // animation lands. `InteractionManager` defers the navigation until the
  // sheet's spring settles, so the screen never crossfades two animations.
  const handleFrameShot = useCallback(
    (spot: AnitabiPoint) => {
      Haptics.selectionAsync().catch(() => undefined);
      const params = buildCompareParams(spot);
      closeSheet();
      InteractionManager.runAfterInteractions(() => {
        router.push({ pathname: '/pilgrimage/compare/tips', params });
      });
    },
    [buildCompareParams, closeSheet, router]
  );

  const handleStartCamera = useCallback(
    (spot: AnitabiPoint) => {
      Haptics.selectionAsync().catch(() => undefined);
      const params = buildCompareParams(spot);
      closeSheet();
      InteractionManager.runAfterInteractions(() => {
        router.push({ pathname: '/pilgrimage/compare/[spotId]', params });
      });
    },
    [buildCompareParams, closeSheet, router]
  );

  const handleSeriesSelect = useCallback(
    (next: PilgrimageSeriesSelection) => {
      Haptics.selectionAsync().catch(() => undefined);
      setView({ seriesSelection: next });
    },
    [setView]
  );

  const handleSeriesRetry = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    reload();
  }, [reload]);

  const handleSearchChange = useCallback(
    (text: string) => setView({ spotSearchQuery: text }),
    [setView]
  );
  const handleSearchClear = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setView({ spotSearchQuery: '' });
  }, [setView]);

  const handleSpotFilterChange = useCallback(
    (
      filter: import('../../../libs/services/pilgrimage/pilgrimage-detail-filter').PilgrimageSpotFilter
    ) => {
      Haptics.selectionAsync().catch(() => undefined);
      setView({ spotFilter: filter });
    },
    [setView]
  );

  const handleMarkerModeToggle = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setView((v) => ({ mapMarkerMode: v.mapMarkerMode === 'photo' ? 'dot' : 'photo' }));
  }, [setView]);
  const handleOfflineToggle = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setView((v) => ({ mapOfflineOnly: !v.mapOfflineOnly }));
  }, [setView]);

  const emptyMessage = normalizedSpotSearchQuery
    ? t('pilgrimage.detail.emptySearch')
    : t('pilgrimage.detail.emptyFilter');

  // Build the ordered list of filter states the cycle pill walks through.
  // Always include all / unvisited / visited; conditionally extend with
  // planned / saved / photos when they have data (or when the current
  // selection is one of them, so the cycle can return through it).
  const filterCycleStates = useMemo<readonly FilterCyclePillState[]>(() => {
    const states: FilterCyclePillState[] = [
      { filter: 'all', label: t('pilgrimage.detail.filter.all'), badge: groupedCounts.all },
      {
        filter: 'unvisited',
        label: t('pilgrimage.detail.filter.unvisited'),
        badge: groupedCounts.unvisited,
      },
      {
        filter: 'visited',
        label: t('pilgrimage.detail.filter.visited'),
        badge: groupedCounts.visited,
      },
    ];
    if (groupedCounts.planned > 0 || spotFilter === 'planned') {
      states.push({
        filter: 'planned',
        label: t('pilgrimage.detail.filter.planned'),
        badge: groupedCounts.planned,
        icon: 'flag',
      });
    }
    if (groupedCounts.saved > 0 || spotFilter === 'saved') {
      states.push({
        filter: 'saved',
        label: t('pilgrimage.detail.filter.saved'),
        badge: groupedCounts.saved,
        icon: 'bookmark',
      });
    }
    if (groupedCounts.photos > 0 || spotFilter === 'photos') {
      states.push({
        filter: 'photos',
        label: t('pilgrimage.detail.filter.photos'),
        badge: groupedCounts.photos,
        icon: 'camera',
      });
    }
    return states;
  }, [
    groupedCounts.all,
    groupedCounts.unvisited,
    groupedCounts.visited,
    groupedCounts.planned,
    groupedCounts.saved,
    groupedCounts.photos,
    spotFilter,
    t,
  ]);

  // The bottom sheet writes its top-edge Y (from the top of the screen) into
  // this shared value every frame. The floating filter strip + view-mode
  // toggle anchor to it via `useAnimatedStyle` so they hug the sheet's edge
  // instead of sitting at a fixed point that disappears behind the sheet at
  // mid snap. Starts at the screen height = sheet closed; gorhom overwrites
  // it on first layout.
  const screenHeight = Dimensions.get('window').height;
  const sheetPosition = useSharedValue(screenHeight);

  // Fallback static offset (used as bottom inset for the chrome when the
  // sheet hasn't laid out yet, or when reduced-motion is on). Keeps the
  // chrome visible above the sheet's peek edge on first paint.
  const sheetPeekOffset = useMemo(() => {
    return Math.max(
      VIEW_MODE_TOGGLE_HEIGHT + insets.bottom + 12,
      Math.round(SHEET_PEEK_FRACTION * screenHeight) + 12
    );
  }, [insets.bottom, screenHeight]);

  const handleSheetIndexChange = useCallback((idx: number) => {
    setSheetIndex(idx);
  }, []);

  // Anchor the chrome to the sheet's top edge with a 10px gap. Hide it once
  // the sheet covers the top half of the screen (full snap) so it doesn't
  // float over the scene grid.
  const chromeAnimatedStyle = useAnimatedStyle(() => {
    const bottom = Math.max(screenHeight - sheetPosition.value + 6, sheetPeekOffset);
    const hidden = sheetPosition.value < screenHeight * 0.18;
    return {
      bottom,
      opacity: hidden ? 0 : 1,
    };
  });

  const isEmpty = !loading && !error && (!anime || points.length === 0);
  const hasMap = !!anime && hasValidGeo(anime.geo) && points.length > 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {loading ? (
          <PilgrimageDetailLoadingShell
            themeColor={themeColor}
            seedTitle={chromeSeed.title ?? null}
            seedSubtitle={chromeSeed.titleSecondary ?? null}
            seedPoster={chromeSeed.poster ?? null}
            topInset={insets.top}
            theme={theme}
            onBack={handleBack}
          />
        ) : error ? (
          <SafeAreaView style={styles.errorContainer}>
            <ThemedText variant="titleMedium" weight="700" align="center">
              {t('pilgrimage.detail.errorTitle')}
            </ThemedText>
            <ThemedText variant="bodyMedium" tone="secondary" align="center">
              {error}
            </ThemedText>
            <Pressable
              style={[styles.backBtn, { backgroundColor: theme.accent }]}
              onPress={handleBack}>
              <ThemedText
                variant="bodyMedium"
                weight="700"
                style={{ color: readableTextOn(theme.accent) }}>
                {t('pilgrimage.detail.goBack')}
              </ThemedText>
            </Pressable>
          </SafeAreaView>
        ) : (
          <>
            {/* Layer 1 — map (or themed gradient fallback) fills the screen. */}
            <View style={styles.mapBackground}>
              {hasMap ? (
                <SpotMapView
                  ref={spotMapRef}
                  spots={filteredPoints}
                  visited={visited}
                  ringColor={themeColor}
                  userLocation={userLocation}
                  centerGeo={anime?.geo ?? null}
                  centerZoom={anime?.zoom ?? 12}
                  markerMode={mapMarkerMode}
                  offlineOnly={mapOfflineOnly}
                  focusSpotId={selectedSpotId}
                  controlsBottomOffset={sheetPeekOffset}
                  theme={theme}
                  onSpotPress={openSpot}
                  onClusterPick={openCluster}
                  onUserPan={tracking.onUserPan}
                  style={styles.mapBackgroundInner}
                />
              ) : (
                <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
              )}
              <View style={styles.mapScrim} pointerEvents="none" />
            </View>

            {/* Layer 2 — top-floating chrome (header / search). Series picker
                lives inline next to the back button now (compact dropdown
                pill instead of a horizontal scroll row). */}
            <View style={styles.topOverlay} pointerEvents="box-none">
              <View style={styles.headerActions}>
                <View style={styles.headerLeftGroup}>
                  <RoundHeaderButton
                    icon="chevron-back"
                    onPress={handleBack}
                    accessibilityLabel={t('common.back')}
                    tint={theme.text.primary}
                    theme={theme}
                  />
                  {anime && hasSeriesSwitcher ? (
                    <SeriesDropdownPill
                      entries={seriesEntries}
                      availableCount={availableSeriesEntries.length}
                      selection={effectiveSeriesSelection}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      onSelect={handleSeriesSelect}
                    />
                  ) : null}
                  {anime && seriesDegraded ? (
                    <Pressable
                      onPress={handleSeriesRetry}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={t('pilgrimage.series.loadFailedRetryA11y')}
                      style={({ pressed }) => [styles.seriesWarning, pressed && { opacity: 0.7 }]}>
                      <Ionicons name="cloud-offline-outline" size={14} color={theme.text.secondary} />
                      <ThemedText
                        variant="captionSmall"
                        weight="700"
                        numberOfLines={1}
                        style={{ color: theme.text.secondary, flexShrink: 1 }}>
                        {t('pilgrimage.series.loadFailed')}
                      </ThemedText>
                      <Ionicons name="refresh" size={13} color={theme.text.tertiary} />
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.headerRightGroup}>
                  <RoundHeaderButton
                    icon="images-outline"
                    onPress={handleOpenAlbum}
                    accessibilityLabel={t('pilgrimage.detail.openAlbumA11y')}
                    tint={themeColor}
                    theme={theme}
                  />
                  <RoundHeaderButton
                    icon="share-outline"
                    onPress={handleShare}
                    accessibilityLabel={t('pilgrimage.detail.shareA11y')}
                    tint={theme.text.primary}
                    theme={theme}
                  />
                </View>
              </View>

              {anime ? (
                <View style={styles.searchPill}>
                  <Ionicons name="search" size={16} color={theme.text.tertiary} />
                  <TextInput
                    value={spotSearchQuery}
                    onChangeText={handleSearchChange}
                    placeholder={t('pilgrimage.detail.searchPlaceholder')}
                    placeholderTextColor={theme.text.tertiary}
                    returnKeyType="search"
                    autoCorrect={false}
                    autoCapitalize="none"
                    selectionColor={themeColor}
                    clearButtonMode="never"
                    accessibilityLabel={t('pilgrimage.detail.searchA11y')}
                    style={[styles.searchInput, { color: theme.text.primary }]}
                  />
                  {normalizedSpotSearchQuery ? (
                    <Pressable
                      onPress={handleSearchClear}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('pilgrimage.detail.clearSearchA11y')}
                      style={({ pressed }) => [styles.searchClearBtn, pressed && { opacity: 0.7 }]}>
                      <Ionicons name="close-circle" size={18} color={theme.text.tertiary} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {proximityTarget ? (
                <ProximityCheckInBanner
                  spotName={getPilgrimageSpotTitles(proximityTarget.spot).primary}
                  distanceMeters={proximityTarget.distanceMeters}
                  theme={theme}
                  t={t}
                  onCheckIn={handleProximityCheckIn}
                  onDismiss={handleProximityDismiss}
                />
              ) : null}
            </View>

            {/* Layer 3 — map-side dock for marker / offline toggles. Only in
                map view, and only when we have a real map underneath. Also
                yields to the proximity check-in banner — the banner grows
                the top overlay column enough to overlap the dock's pinned
                position, so the dock hides while the banner is up and
                returns once it's dismissed or checked in. */}
            {hasMap && viewMode === 'map' && sheetIndex <= 1 && proximityTarget == null ? (
              <View
                style={[styles.mapOptionsDock, { top: insets.top + 132 }]}
                pointerEvents="box-none">
                <LayoutModeButton
                  icon={mapMarkerMode === 'photo' ? 'image-outline' : 'ellipse'}
                  active={mapMarkerMode === 'dot'}
                  themeColor={themeColor}
                  themeColorFg={themeColorFg}
                  theme={theme}
                  accessibilityLabel={
                    mapMarkerMode === 'photo'
                      ? t('pilgrimage.detail.useDotMarkersA11y')
                      : t('pilgrimage.detail.usePhotoMarkersA11y')
                  }
                  onPress={handleMarkerModeToggle}
                />
                <LayoutModeButton
                  icon="cloud-offline-outline"
                  active={mapOfflineOnly}
                  themeColor={themeColor}
                  themeColorFg={themeColorFg}
                  theme={theme}
                  accessibilityLabel={t('pilgrimage.detail.useCachedTilesA11y')}
                  onPress={handleOfflineToggle}
                />
              </View>
            ) : null}

            {/* Layer 4+5 — floating chrome (filter cycle pill + view-mode
                toggle), anchored to the bottom sheet's top edge so it slides
                with the sheet rather than getting buried at mid snap. Hidden
                at full snap so it doesn't float over the scene grid. */}
            {anime ? (
              <Animated.View
                style={[styles.bottomChromeWrap, chromeAnimatedStyle]}
                pointerEvents="box-none">
                <View style={styles.filterCycleRow}>
                  <FilterCyclePill
                    states={filterCycleStates}
                    current={spotFilter}
                    themeColor={themeColor}
                    themeColorFg={themeColorFg}
                    theme={theme}
                    onCycle={handleSpotFilterChange}
                  />
                </View>
                <View style={styles.viewModeWrapInner}>
                  <View style={styles.viewModeBar}>
                    <ViewModeSegment
                      icon="apps"
                      label={t('pilgrimage.detail.viewMode.grid')}
                      count={filteredGroupedSpots.length}
                      active={activeViewPreset === 'grid'}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      styles={styles}
                      onPress={() => handleViewPresetChange('grid')}
                    />
                    <ViewModeSegment
                      icon="reorder-three"
                      label={t('pilgrimage.detail.viewMode.rows')}
                      count={filteredGroupedSpots.length}
                      active={activeViewPreset === 'rows'}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      styles={styles}
                      onPress={() => handleViewPresetChange('rows')}
                    />
                    <ViewModeSegment
                      icon="map"
                      label={t('pilgrimage.detail.viewMode.map')}
                      count={filteredMappablePointCount}
                      active={activeViewPreset === 'map'}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      styles={styles}
                      onPress={() => handleViewPresetChange('map')}
                    />
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {/* Layer 6 — persistent pull-up bottom sheet with anime info
                + scene grid. Snaps follow viewMode (peek for map, mid for
                grid/rows). */}
            <PilgrimageDetailSheet
              anime={anime}
              animeTitles={animeTitles}
              animeSubtitle={animeSubtitle}
              browseLabel={browseLabel}
              posterUri={posterUri}
              spotStats={spotStats}
              userStats={userStats}
              filteredGroupedSpots={filteredGroupedSpots}
              totalSpotCount={groupedSpots.length}
              listLayout={listLayout}
              viewMode={viewMode}
              themeColor={themeColor}
              themeColorFg={themeColorFg}
              theme={theme}
              visited={visited}
              captures={captures}
              spotIntents={spotIntents}
              emptyMessage={isEmpty ? t('pilgrimage.detail.emptyNoData') : emptyMessage}
              animatedPosition={sheetPosition}
              onSheetIndexChange={handleSheetIndexChange}
              onOpenBrowse={handleOpenBrowse}
              onSpotPress={openGroup}
              onToggleVisited={toggleGroupedVisited}
              onAreaPress={handleAreaPress}
              onOpenMaps={handleOpenMaps}
              onTakeComparison={handleFrameShot}
              representativeForGroup={representativeForGroup}
              distanceForGroup={distanceForGroup}
              hasIntentForGroup={hasIntentForGroup}
            />

            {/* Locate FAB — only meaningful when a real map is mounted. The
                map is the full-bleed background in every view mode (grid/rows
                just raise the sheet over it), so the FAB shows whenever the
                map does. It anchors to the bottom sheet so it never hides
                behind the drag handle, and fades itself out at the full snap
                when the sheet covers the visible map. */}
            {hasMap ? (
              <LocateFab
                state={tracking.state}
                onPress={tracking.cycleState}
                sheetAnimatedPosition={sheetPosition}
                screenHeight={screenHeight}
                bottomInset={sheetPeekOffset}
                edgeGap={LOCATE_FAB_EDGE_GAP}
                loading={tracking.isRequestingPermission}
              />
            ) : null}
          </>
        )}

        {/* Permission sheet (permanent denial) — lives outside the loading
            branch so it survives a state flip mid-animation. */}
        <LocationPermissionSheet
          visible={tracking.permissionSheetVisible}
          onDismiss={tracking.dismissPermissionSheet}
        />

        {/* Spot sheet + cluster picker stack on top of everything when open. */}
        <SpotSheet
          spot={activeSpot}
          scenes={activeSpotScenes}
          sceneCount={activeSpotSceneCount}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          distanceKm={activeSpotDistance}
          userLocation={userLocation}
          visitedTarget={activeSpotVisitedTarget}
          visited={activeSpotVisited}
          saved={activeSpotSaved}
          planned={activeSpotPlanned}
          hasCapture={activeSpotHasCapture}
          anitabiBangumiId={anime?.id ?? bangumiId ?? null}
          theme={theme}
          onClose={closeSheet}
          onToggleVisited={toggleVisitedPoint}
          onToggleSaved={handleToggleSaved}
          onTogglePlanned={handleTogglePlanned}
          onOpenMaps={handleOpenMaps}
          onStartCamera={handleStartCamera}
          onFrameShot={handleFrameShot}
          onSelectScene={openSpot}
        />

        <SpotClusterPicker
          spots={clusterSpots}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          visited={visited}
          theme={theme}
          distanceFor={distanceFor}
          onClose={closeCluster}
          onPick={pickFromCluster}
        />
      </View>
    </>
  );
}

// Segmented view-mode tab. Inlined here because it's a tiny presentational
// helper specific to this route's floating toggle — a separate file would
// add more import noise than the local component is worth.
interface ViewModeSegmentProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  count: number;
  active: boolean;
  themeColor: string;
  themeColorFg: string;
  theme: ReturnType<typeof useTheme>['theme'];
  styles: ReturnType<typeof makePilgrimageDetailStyles>;
  onPress: () => void;
}

function ViewModeSegment({
  icon,
  label,
  count,
  active,
  themeColor,
  themeColorFg,
  theme,
  styles,
  onPress,
}: ViewModeSegmentProps) {
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
