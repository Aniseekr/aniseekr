// Pilgrimage detail screen.
// Path: /pilgrimage/{bangumiId}
//
// Spec: spec/pilgrimage_spec.md §8 (Routes).
//
// Visual language: map-first. The native map fills the screen; only
// navigation and one tools affordance float above it. Search, filter and
// anime context live in the persistent content sheet. Dragging it up focuses
// on scenes.
//
// CLAUDE.md Rule 9: this file is the route shell. State + side effects live
// in feature hooks (usePilgrimageDetailData / Interactions / DerivedSpots /
// SpotSheet) and every leaf is its own memo'd component under
// `components/pilgrimage/detail/`. We do not add new top-level `useState`s
// here without first asking whether the value belongs in a hook or a child.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Dimensions, Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { runAfterInteractions } from '../../../libs/utils/after-interactions';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../context/ThemeContext';
import { ThemedButton, ThemedText, readableTextOn } from '../../../components/themed';
import { PLATFORM_CONFIGS, type PlatformType } from '../../../libs/services/auth/types';
import { isSupportedBrowseSource } from '../../../libs/services/data-source-config';
import { getNumberParam, getStringParam } from '../../../libs/utils/route-params';
import {
  getPilgrimageAnimeTitles,
  getPilgrimageSpotTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';
import {
  buildPilgrimageEventDetailRoute,
  getPilgrimageDetailBackRoute,
  resolvePilgrimageSpotFocus,
} from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import {
  mergePilgrimageSeriesEntries,
  type PilgrimageSeriesSelection,
} from '../../../libs/services/pilgrimage/pilgrimage-series';
import type { PilgrimageSpot } from '../../../libs/services/pilgrimage/types';
import { nearestUnvisitedWithin } from '../../../libs/services/pilgrimage/proximity-checkin';
import { usePilgrimageDetailView } from '../../../hooks/usePilgrimageDetailView';
import { usePilgrimageDetailData } from '../../../hooks/usePilgrimageDetailData';
import { bannerEnter, bannerExit } from '../../../libs/animations/presets';
import {
  LOCATE_FAB_COMPASS_ZOOM,
  LOCATE_FAB_ZOOM,
  useUserLocationTracking,
} from '../../../libs/services/pilgrimage/use-user-location-tracking';
import { LocateFab } from '../../../components/pilgrimage/LocateFab';
import { LocationPermissionSheet } from '../../../components/pilgrimage/LocationPermissionSheet';
import { usePilgrimageInteractions } from '../../../hooks/usePilgrimageInteractions';
import { usePilgrimageDerivedSpots } from '../../../hooks/usePilgrimageDerivedSpots';
import { usePilgrimageDetailIntel } from '../../../hooks/usePilgrimageDetailIntel';
import { usePilgrimageSpotSheet } from '../../../hooks/usePilgrimageSpotSheet';
import {
  PilgrimageDetailToolsMenu,
  PilgrimageDetailLoadingShell,
  PilgrimageDetailSheet,
  ProximityCheckInBanner,
  RoundHeaderButton,
  SeriesDropdownPill,
  SpotClusterPicker,
  SpotMapView,
  SpotSheet,
  buildBrowseUrl,
  buildMapsURL,
  getSpotGeo,
  makePilgrimageDetailStyles,
  type SpotMapViewHandle,
} from '../../../components/pilgrimage/detail';
import { useI18n, useT } from '../../../libs/i18n';
import {
  LocalityMapLegend,
  type LegendKind,
} from '../../../components/pilgrimage/map/LocalityMapLegend';
import { localityMarkerPalette } from '../../../components/pilgrimage/common/LocalityAesthetic';
import type { MapMarker } from '../../../components/pilgrimage/map';
import { get88EntriesWithCoords } from '../../../libs/services/pilgrimage/anime88-repository';
import {
  buildAnime88AreaMarkers,
  buildCanonicalLocalityMarkers,
} from '../../../libs/services/pilgrimage/locality/map-markers';
import { localityRepository } from '../../../libs/services/pilgrimage/locality/locality-repository';
import { useExperienceMode } from '../../../hooks/useExperienceMode';
import { resolveExperienceTabTarget } from '../../../libs/navigation/experience-tabs';
import { buildSpotCompareParams } from '../../../libs/services/pilgrimage/reference-route';
import type { AnimeAtlasContext } from '../../../libs/services/pilgrimage/atlas/atlas-resolver';
import { buildPilgrimageWebUrl } from '../../../libs/services/pilgrimage/pilgrimage-web-link';

// Sheet snap height as a fraction of the screen — kept in lockstep with the
// first snap point in PilgrimageDetailSheet. Map controls use it as a safe
// bottom inset so they never disappear behind the persistent sheet.
const SHEET_PEEK_FRACTION = 0.34;

const LOCATE_FAB_EDGE_GAP = 10;

// Foreground proximity check-in radius (spec 3.5) — distinct from the 150m
// standalone-capture mount radius in nearest-cached-spot.ts (spec 3.2).
const PROXIMITY_RADIUS_METERS = 100;

const ANIME_88_AREA_ENTRIES = get88EntriesWithCoords();

function subscribeLocality(listener: () => void): () => void {
  return localityRepository.subscribe(listener);
}

function getLocalitySnapshot() {
  return localityRepository.getSnapshot();
}

export default function PilgrimageDetailScreen() {
  const params = useLocalSearchParams();
  const routeAnimeId = getStringParam(params, 'animeId');
  const bangumiId = getNumberParam(params, 'animeId');
  const titleJa = getStringParam(params, 'titleJa');
  const titleEn = getStringParam(params, 'titleEn');
  const routeTitle = getStringParam(params, 'title');
  const titleSecondary = getStringParam(params, 'titleSecondary');
  const poster = getStringParam(params, 'poster');
  const themeColorParam = getStringParam(params, 'themeColor');
  const malId = getNumberParam(params, 'malId');
  const anilistId = getNumberParam(params, 'anilistId');
  const returnTo = getStringParam(params, 'returnTo');
  const returnQuery = getStringParam(params, 'returnQuery');
  const albumAnimeId = getStringParam(params, 'albumAnimeId');
  const routeFocusSpotId = getStringParam(params, 'focusSpotId');
  const atlasContext = useMemo<AnimeAtlasContext | undefined>(() => {
    if (!titleJa && !titleEn && !routeTitle && malId === null && anilistId === null)
      return undefined;
    return { bgmId: bangumiId, malId, anilistId, titleJa, titleEn, title: routeTitle };
  }, [anilistId, bangumiId, malId, routeTitle, titleEn, titleJa]);
  const workKey = routeAnimeId && !/^\d+$/.test(routeAnimeId) ? routeAnimeId : null;
  const isExplorerFlow = getStringParam(params, 'returnTo')?.startsWith('explorer-') ?? false;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { visibleTabs } = useExperienceMode();
  const journalTarget = resolveExperienceTabTarget(
    isExplorerFlow ? visibleTabs : [],
    'explorerJournal',
    '/pilgrimage/album'
  );
  const t = useT();
  const { language } = useI18n();
  const localitySnapshot = useSyncExternalStore(
    subscribeLocality,
    getLocalitySnapshot,
    getLocalitySnapshot
  );
  // Frame-1 chrome seed (title / poster / themeColor) carried in by the
  // lister so we can paint hero + accent before any I/O resolves
  // (CLAUDE.md Rule 10). When the real data arrives it replaces the seed.
  const chromeSeed = {
    title: routeTitle,
    titleSecondary,
    poster,
    themeColor: themeColorParam,
  };
  const focusSpotId = routeFocusSpotId;
  const consumedSpotFocusRef = useRef<string | null>(null);

  const { view, setView } = usePilgrimageDetailView();
  const {
    seriesSelection,
    viewMode,
    searchOpen,
    mapMarkerMode,
    mapOfflineOnly,
    spotFilter,
    spotSearchQuery,
  } = view;
  const mainSpotFilter =
    spotFilter === 'unvisited' || spotFilter === 'visited' ? spotFilter : 'all';

  const resetSeriesSelection = useCallback(() => {
    setView({ seriesSelection: 'all' });
  }, [setView]);
  const { seriesEntries, loading, error, seriesDegraded, browseSource, reload } =
    usePilgrimageDetailData(bangumiId, resetSeriesSelection, atlasContext, workKey);

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

  const themeColor = chromeSeed.themeColor || theme.accent;
  const themeColorFg = readableTextOn(themeColor);
  const styles = useMemo(() => makePilgrimageDetailStyles(theme, insets.top), [theme, insets.top]);
  const animeTitles = useMemo(() => (anime ? getPilgrimageAnimeTitles(anime) : null), [anime]);
  const fallbackTitle =
    chromeSeed.title ||
    getStringParam(params, 'titleJa') ||
    getStringParam(params, 'titleEn') ||
    getStringParam(params, 'title') ||
    '—';
  const localityAnimeId = anime?.bgm?.[0] ?? bangumiId;
  const localityMarkers = useMemo<MapMarker[]>(() => {
    void localitySnapshot;
    if (localityAnimeId === null) return [];
    const roleMarkers = buildCanonicalLocalityMarkers(
      localityRepository,
      localityMarkerPalette(theme),
      { animeId: localityAnimeId, language }
    );
    const areaMarkers = buildAnime88AreaMarkers(
      ANIME_88_AREA_ENTRIES.filter((entry) => entry.externalIds.bangumi === localityAnimeId),
      theme.status.info
    );
    return [...roleMarkers, ...areaMarkers];
  }, [language, localityAnimeId, localitySnapshot, theme]);

  // The legend names only what is actually on this map.
  const legendKinds = useMemo<LegendKind[]>(() => {
    const present = new Set(localityMarkers.map((marker) => marker.kind));
    return (['stamp', 'shop', 'festival', 'area'] as const).filter((kind) => present.has(kind));
  }, [localityMarkers]);

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
    spotFilter: mainSpotFilter,
    spotSearchQuery,
  });
  const {
    groupedSpotByPointId,
    filteredGroupedSpots,
    filteredPoints,
    groupedCounts,
    normalizedSpotSearchQuery,
    spotStats,
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
    spot: PilgrimageSpot;
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
  // The banner targets a specific spot snapshot. If that spot gets checked in
  // some other way while the banner is still up, derive it away instead of
  // synchronously clearing state from an effect.
  const visibleProximityTarget =
    proximityTarget && !visited[proximityTarget.spot.id] ? proximityTarget : null;
  const handleProximityCheckIn = useCallback(() => {
    // Guard against a stale banner: `toggleVisitedPoint` is bidirectional, so
    // if the spot was already checked in elsewhere while the banner sat open,
    // tapping it must not reverse (check OUT) a real visit.
    if (!visibleProximityTarget) {
      setProximityTarget(null);
      return;
    }
    toggleVisitedPoint(visibleProximityTarget.spot);
    setProximityTarget(null);
  }, [visibleProximityTarget, toggleVisitedPoint]);
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
    menuSpotId,
    setMenuSpotId,
    openGroup,
    selectSpot,
    openDetails,
    openCluster,
    closeSheet,
    clearSelection,
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

  // Curated local-intel (best time / shops / events) for the open spot. Sync
  // bundled reads — no effect on first paint (Rule 10).
  const spotIntel = usePilgrimageDetailIntel(anime?.bgm?.[0] ?? bangumiId ?? null, activeSpot);

  useEffect(() => {
    const focusedGroup = focusSpotId ? groupedSpotByPointId.get(focusSpotId) : null;
    const focusedSpot = focusedGroup;
    const resolved = resolvePilgrimageSpotFocus({
      bangumiId,
      focusSpotId,
      spotIsAvailable: focusedSpot !== null,
      consumedKey: consumedSpotFocusRef.current,
    });
    consumedSpotFocusRef.current = resolved.consumedKey;
    if (resolved.spotId && focusedSpot) {
      // The route target must enter the sheet's list before selectSpot asks it to scroll.
      if (!filteredGroupedSpots.some((group) => group.id === focusedGroup?.id)) {
        setView({ spotFilter: 'all', spotSearchQuery: '' });
      }
      selectSpot(focusedSpot);
    }
  }, [bangumiId, focusSpotId, groupedSpotByPointId, filteredGroupedSpots, selectSpot, setView]);

  const posterUri = useMemo(() => {
    if (chromeSeed.poster) return chromeSeed.poster;
    const posterSubjectId = anime?.bgm?.[0] ?? bangumiId;
    if (typeof posterSubjectId === 'number' && posterSubjectId > 0) {
      return `https://api.bgm.tv/v0/subjects/${posterSubjectId}/image?type=common`;
    }
    return '';
  }, [bangumiId, anime?.bgm, chromeSeed.poster]);

  const handleOpenMaps = useCallback((spot: PilgrimageSpot) => {
    const geo = getSpotGeo(spot);
    if (!geo) return;
    Haptics.selectionAsync().catch(() => undefined);
    Linking.openURL(buildMapsURL(geo[0], geo[1], spot.name)).catch(() => undefined);
  }, []);

  const handleLocalityMarkerPress = useCallback(
    (marker: MapMarker) => {
      if (marker.eventId) {
        router.push(buildPilgrimageEventDetailRoute(marker.eventId));
        return;
      }
      if (marker.precision === 'exact') {
        Linking.openURL(buildMapsURL(marker.lat, marker.lng, marker.title)).catch(() => undefined);
      }
    },
    [router]
  );

  const handleToggleSaved = useCallback(
    (spot: PilgrimageSpot) => {
      if (anime) toggleSpotIntent(spot, 'saved', groupedSpotByPointId, anime);
    },
    [toggleSpotIntent, groupedSpotByPointId, anime]
  );
  const handleTogglePlanned = useCallback(
    (spot: PilgrimageSpot) => {
      if (anime) toggleSpotIntent(spot, 'planned', groupedSpotByPointId, anime);
    },
    [toggleSpotIntent, groupedSpotByPointId, anime]
  );

  const handleOpenBrowse = useCallback(() => {
    if (!anime) return;
    const url = buildBrowseUrl(browseSource, anime.bgm?.[0] ?? bangumiId ?? 0);
    if (!url) return;
    Linking.openURL(url).catch(() => undefined);
  }, [anime, bangumiId, browseSource]);

  const backRoute = useMemo(
    () =>
      getPilgrimageDetailBackRoute({
        returnTo: returnTo ?? undefined,
        returnQuery: returnQuery ?? undefined,
        albumAnimeId: albumAnimeId ?? undefined,
        animeId: routeAnimeId ?? undefined,
      }),
    [albumAnimeId, returnQuery, returnTo, routeAnimeId]
  );
  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    if (backRoute) {
      router.replace(backRoute);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/pilgrimage');
    }
  }, [backRoute, router]);

  const handleOpenAlbum = useCallback(() => {
    if (bangumiId === null) return;
    Haptics.selectionAsync().catch(() => undefined);
    if (journalTarget.isVisibleTab) {
      router.navigate(journalTarget.href);
      return;
    }
    router.push({ pathname: journalTarget.href, params: { animeId: String(bangumiId) } });
  }, [router, bangumiId, journalTarget.href, journalTarget.isVisibleTab]);

  const handleShare = useCallback(() => {
    if (!anime) return;
    Haptics.selectionAsync().catch(() => undefined);
    const url = buildBrowseUrl(browseSource, anime.bgm?.[0] ?? bangumiId ?? 0) ?? '';
    Share.share({
      message: t('pilgrimage.detail.shareMessage', {
        title: animeTitles?.primary ?? t('pilgrimage.detail.title'),
        count: spotStats.spotCount,
        urlLine: url ? `\n${url}` : '',
      }),
    }).catch(() => undefined);
  }, [anime, animeTitles?.primary, bangumiId, browseSource, spotStats.spotCount, t]);

  const browseLabel = useMemo(() => {
    const platform = isSupportedBrowseSource(browseSource) ? browseSource : 'bangumi';
    return (
      PLATFORM_CONFIGS[platform as PlatformType]?.displayName ??
      t('pilgrimage.detail.browseFallback')
    );
  }, [browseSource, t]);

  const buildCompareParams = useCallback(
    (spot: PilgrimageSpot) => (anime ? buildSpotCompareParams(spot, anime, themeColor) : null),
    [anime, themeColor]
  );
  const webUrl = anime?.key ? buildPilgrimageWebUrl(anime.key, language, 'work') : null;
  const handleOpenWeb = useCallback(() => {
    if (!webUrl) return;
    void WebBrowser.openBrowserAsync(webUrl).catch(() => undefined);
  }, [webUrl]);

  // Phase 3: close the sheet first, then push the route after the dismiss
  // animation lands. `runAfterInteractions` defers the navigation until the
  // sheet's spring settles, so the screen never crossfades two animations.
  const handleFrameShot = useCallback(
    (spot: PilgrimageSpot) => {
      Haptics.selectionAsync().catch(() => undefined);
      const params = buildCompareParams(spot);
      if (!params) return;
      closeSheet();
      runAfterInteractions(() => {
        router.push({ pathname: '/compare/tips', params });
      });
    },
    [buildCompareParams, closeSheet, router]
  );

  const handleStartCamera = useCallback(
    (spot: PilgrimageSpot) => {
      Haptics.selectionAsync().catch(() => undefined);
      const params = buildCompareParams(spot);
      if (!params) return;
      closeSheet();
      runAfterInteractions(() => {
        router.push({ pathname: '/compare/[spotId]', params });
      });
    },
    [buildCompareParams, closeSheet, router]
  );

  const handleIdentifyScene = useCallback(
    (_spot: PilgrimageSpot) => {
      closeSheet();
      runAfterInteractions(() => router.push('/pilgrimage/identify'));
    },
    [closeSheet, router]
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
    setView({ spotSearchQuery: '', searchOpen: false });
  }, [setView]);
  const handleSearchOpen = useCallback(() => setView({ searchOpen: true }), [setView]);

  const handleSpotFilterChange = useCallback(
    (
      filter: import('../../../libs/services/pilgrimage/pilgrimage-detail-filter').PilgrimageSpotFilter
    ) => {
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

  // The bottom sheet writes its top-edge Y into this shared value. Native map
  // controls use it directly, avoiding JS state on every drag frame.
  const screenHeight = Dimensions.get('window').height;
  const sheetPosition = useSharedValue(screenHeight);
  // How much of the map the sheet covers right now, so a focused pin lands in
  // the visible part of the map instead of behind the sheet.
  const getSheetCover = useCallback(
    () => Math.max(0, screenHeight - sheetPosition.value),
    [screenHeight, sheetPosition]
  );

  // Static fallback used by map-native controls before the sheet reports its
  // animated top edge on first layout.
  const sheetPeekOffset = useMemo(() => {
    return Math.max(insets.bottom + 64, Math.round(SHEET_PEEK_FRACTION * screenHeight) + 12);
  }, [insets.bottom, screenHeight]);

  const isEmpty =
    !loading && !error && (!anime || (points.length === 0 && localityMarkers.length === 0));
  const firstLocatedSpot = points.find((spot) => spot.lat !== null && spot.lon !== null);
  const centerGeo: [number, number] | null = firstLocatedSpot
    ? [firstLocatedSpot.lat as number, firstLocatedSpot.lon as number]
    : null;
  const hasMap = localityMarkers.length > 0 || centerGeo !== null;

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
            <ThemedButton
              variant="secondary"
              label={t('pilgrimage.detail.errorRetry')}
              onPress={handleSeriesRetry}
            />
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
                  localityMarkers={localityMarkers}
                  visited={visited}
                  ringColor={themeColor}
                  userLocation={userLocation}
                  centerGeo={centerGeo}
                  centerZoom={12}
                  markerMode={mapMarkerMode}
                  offlineOnly={mapOfflineOnly}
                  focusSpotId={selectedSpotId}
                  getFocusBottomInset={getSheetCover}
                  controlsBottomOffset={sheetPeekOffset}
                  theme={theme}
                  onSpotPress={selectSpot}
                  onClusterPick={openCluster}
                  onLocalityMarkerPress={handleLocalityMarkerPress}
                  onUserPan={tracking.onUserPan}
                  style={styles.mapBackgroundInner}
                />
              ) : (
                <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
              )}
              <View style={styles.mapScrim} pointerEvents="none" />
              {legendKinds.length > 0 && !visibleProximityTarget ? (
                <LocalityMapLegend kinds={legendKinds} style={styles.localityLegend} />
              ) : null}
            </View>

            {/* Layer 2 — navigation-only chrome. Browsing controls live in
                the content sheet; secondary map actions live behind one
                anchored layers menu. */}
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
                      <Ionicons
                        name="cloud-offline-outline"
                        size={14}
                        color={theme.text.secondary}
                      />
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
                  <PilgrimageDetailToolsMenu
                    hasMap={hasMap}
                    mapMarkerMode={mapMarkerMode}
                    mapOfflineOnly={mapOfflineOnly}
                    themeColor={themeColor}
                    onShare={handleShare}
                    onToggleMarkerMode={handleMarkerModeToggle}
                    onToggleOfflineOnly={handleOfflineToggle}
                  />
                </View>
              </View>

              {visibleProximityTarget ? (
                <Animated.View entering={bannerEnter()} exiting={bannerExit()}>
                  <ProximityCheckInBanner
                    spotName={getPilgrimageSpotTitles(visibleProximityTarget.spot).primary}
                    distanceMeters={visibleProximityTarget.distanceMeters}
                    theme={theme}
                    t={t}
                    onCheckIn={handleProximityCheckIn}
                    onDismiss={handleProximityDismiss}
                  />
                </Animated.View>
              ) : null}
            </View>

            {/* Layer 3 — persistent pull-up bottom sheet with browse controls,
                anime info,
                + scene grid. Snaps follow viewMode (peek for map, mid for
                grid/rows). */}
            <PilgrimageDetailSheet
              anime={anime}
              animeTitles={animeTitles}
              fallbackTitle={fallbackTitle}
              browseLabel={browseLabel}
              posterUri={posterUri}
              filteredGroupedSpots={filteredGroupedSpots}
              viewMode={viewMode}
              themeColor={themeColor}
              theme={theme}
              visited={visited}
              spotSearchQuery={spotSearchQuery}
              searchOpen={searchOpen}
              groupedCounts={groupedCounts}
              spotFilter={mainSpotFilter}
              selectedSpotId={selectedSpotId}
              selectedSpot={
                selectedSpotId ? (groupedSpotByPointId.get(selectedSpotId) ?? null) : null
              }
              menuSpotId={menuSpotId}
              emptyMessage={isEmpty ? t('pilgrimage.detail.emptyNoData') : emptyMessage}
              animatedPosition={sheetPosition}
              onOpenBrowse={handleOpenBrowse}
              onSearchChange={handleSearchChange}
              onSearchClear={handleSearchClear}
              onSearchOpen={handleSearchOpen}
              onSpotFilterChange={handleSpotFilterChange}
              onSpotPress={openGroup}
              onClearSelection={clearSelection}
              onToggleVisited={toggleGroupedVisited}
              onOpenMaps={handleOpenMaps}
              onStartCamera={handleStartCamera}
              onFrameShot={handleFrameShot}
              onIdentifyScene={handleIdentifyScene}
              onToggleSaved={handleToggleSaved}
              onOpenDetails={openDetails}
              onMenuOpen={setMenuSpotId}
              onMenuClose={() => setMenuSpotId(null)}
              representativeForGroup={representativeForGroup}
              distanceForGroup={distanceForGroup}
              hasIntentForGroup={hasIntentForGroup}
              webUrl={webUrl}
              onOpenWeb={handleOpenWeb}
            />

            {/* Locate FAB — only meaningful when a real map is mounted. The
                map is the full-bleed background in every view mode (grid/rows
                just raise the sheet over it), so the FAB shows whenever the
                map does. It anchors to the bottom sheet so it never hides
                behind the drag handle, and fades itself out at the full snap
                when the sheet covers the visible map. */}
            {hasMap ? (
              <View pointerEvents="box-none">
                <LocateFab
                  state={tracking.state}
                  onPress={tracking.cycleState}
                  sheetAnimatedPosition={sheetPosition}
                  screenHeight={screenHeight}
                  bottomInset={sheetPeekOffset}
                  edgeGap={LOCATE_FAB_EDGE_GAP}
                  loading={tracking.isRequestingPermission}
                />
              </View>
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
          intel={spotIntel}
          theme={theme}
          onClose={closeSheet}
          onToggleVisited={toggleVisitedPoint}
          onToggleSaved={handleToggleSaved}
          onTogglePlanned={handleTogglePlanned}
          onOpenMaps={handleOpenMaps}
          onStartCamera={handleStartCamera}
          onFrameShot={handleFrameShot}
          onIdentifyScene={handleIdentifyScene}
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
