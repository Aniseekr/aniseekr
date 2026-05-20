// Pilgrimage detail screen.
// Path: /pilgrimage/{bangumiId}
//
// Spec: spec/pilgrimage_spec.md §8 (Routes).
//
// Visual language follows japanwalker.pen: a parallax hero, then a glassy
// floating header (back / camera / share) whose backdrop and sticky title
// fade in once the hero scrolls past. All surfaces flow from useTheme() so a
// theme/accent switch repaints the whole screen.
//
// CLAUDE.md Rule 9: this file is the route shell. State + side effects live
// in feature hooks (usePilgrimageDetailData / Interactions / DerivedSpots /
// SpotSheet) and every list item is its own memo'd component under
// `components/pilgrimage/detail/`. We do not add new top-level `useState`s
// here without first asking whether the value belongs in a hook or a child.

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  InteractionManager,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

// Driving `intensity` through reanimated props lets the blur kernel sit at 0
// while the hero is on screen — otherwise iOS keeps compositing a 50-intensity
// blur every frame even though the wrapper Animated.View is at opacity 0.
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../context/ThemeContext';
import { Skeleton, ThemedText, readableTextOn } from '../../../components/themed';
import { PLATFORM_CONFIGS, type PlatformType } from '../../../libs/services/auth/types';
import { isSupportedBrowseSource } from '../../../libs/services/data-source-config';
import { getNumberParam } from '../../../libs/utils/route-params';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeTitles,
  getPilgrimageSpotTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { getPilgrimageDetailBackRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import {
  mergePilgrimageSeriesEntries,
  type PilgrimageSeriesSelection,
} from '../../../libs/services/pilgrimage/pilgrimage-series';
import {
  getPilgrimageDetailViewPreset,
  resolvePilgrimageDetailViewPreset,
  type PilgrimageDetailViewPreset,
} from '../../../libs/services/pilgrimage/pilgrimage-detail-flow';
import type { AnitabiPoint, AnitabiSpot } from '../../../libs/services/pilgrimage/types';
import {
  usePilgrimageDetailView,
} from '../../../hooks/usePilgrimageDetailView';
import { usePilgrimageDetailData } from '../../../hooks/usePilgrimageDetailData';
import { usePilgrimageUserLocation } from '../../../hooks/usePilgrimageUserLocation';
import { usePilgrimageInteractions } from '../../../hooks/usePilgrimageInteractions';
import { usePilgrimageDerivedSpots } from '../../../hooks/usePilgrimageDerivedSpots';
import { usePilgrimageSpotSheet } from '../../../hooks/usePilgrimageSpotSheet';
import {
  HEADER_HEIGHT,
  HERO_HEIGHT,
  LayoutModeButton,
  PilgrimageDetailHeader,
  PilgrimageEmptyCard,
  PilgrimageList,
  RoundHeaderButton,
  SpotChip,
  SpotClusterPicker,
  SpotMapView,
  SpotSheet,
  buildBrowseUrl,
  buildMapsURL,
  getPointSourceBangumiId,
  hasValidGeo,
  makePilgrimageDetailStyles,
} from '../../../components/pilgrimage/detail';

export default function PilgrimageDetailScreen() {
  const params = useLocalSearchParams();
  const bangumiId = getNumberParam(params, 'animeId');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

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
  const { seriesEntries, loading, error, browseSource } = usePilgrimageDetailData(
    bangumiId,
    resetSeriesSelection
  );

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

  const themeColor = anime?.color || theme.accent;
  const themeColorFg = readableTextOn(themeColor);
  const styles = useMemo(
    () => makePilgrimageDetailStyles(theme, insets.top),
    [theme, insets.top]
  );
  const animeTitles = useMemo(() => (anime ? getPilgrimageAnimeTitles(anime) : null), [anime]);
  const animeSubtitle = animeTitles ? formatPilgrimageSubtitle(animeTitles) : undefined;

  const userLocation = usePilgrimageUserLocation();
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

  // scrollY drives the hero parallax + sticky-header worklets. The
  // Animated.ScrollView (map mode) feeds it via useAnimatedScrollHandler (UI
  // thread); FlashList (list/grid) feeds it via a plain JS onScroll. That
  // gives FlashList native virtualization without fighting createAnimated
  // wrapping; SharedValue updates from JS still propagate to the UI-thread
  // worklets within one frame which keeps the parallax smooth.
  const scrollY = useSharedValue(0);
  const animatedScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.value = event.nativeEvent.contentOffset.y;
    },
    [scrollY]
  );

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
  }, [viewMode, filteredGroupedSpots.length, filteredPointIds, fallbackSelectedSpotId, setSelectedSpotId]);

  const posterUri = useMemo(() => {
    const posterSubjectId = anime?.id ?? bangumiId;
    if (typeof posterSubjectId === 'number' && posterSubjectId > 0) {
      return `https://api.bgm.tv/v0/subjects/${posterSubjectId}/image?type=large`;
    }
    return anime?.cover ?? '';
  }, [bangumiId, anime?.id, anime?.cover]);

  const handleSpotChipPress = useCallback(
    (spot: AnitabiPoint) => {
      Haptics.selectionAsync().catch(() => undefined);
      setSelectedSpotId(spot.id);
    },
    [setSelectedSpotId]
  );

  const handleOpenMaps = useCallback((spot: AnitabiPoint) => {
    if (!hasValidGeo(spot.geo)) return;
    Haptics.selectionAsync().catch(() => undefined);
    Linking.openURL(buildMapsURL(spot.geo[0], spot.geo[1], spot.name)).catch(() => undefined);
  }, []);

  const handleToggleSaved = useCallback(
    (spot: AnitabiPoint) => toggleSpotIntent(spot, 'saved', groupedSpotByPointId),
    [toggleSpotIntent, groupedSpotByPointId]
  );
  const handleTogglePlanned = useCallback(
    (spot: AnitabiPoint) => toggleSpotIntent(spot, 'planned', groupedSpotByPointId),
    [toggleSpotIntent, groupedSpotByPointId]
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
      message: `${animeTitles?.primary ?? 'Pilgrimage'} · ${spotStats.spotCount} scenes${url ? `\n${url}` : ''}`,
    }).catch(() => undefined);
  }, [anime, animeTitles?.primary, browseSource, spotStats.spotCount]);

  const heroAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [-HERO_HEIGHT, 0, HERO_HEIGHT],
      [-HERO_HEIGHT / 2, 0, HERO_HEIGHT * 0.45],
      Extrapolation.CLAMP
    );
    const scale = interpolate(scrollY.value, [-HERO_HEIGHT, 0], [1.6, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY }, { scale }] };
  });
  const heroContentStyle = useAnimatedStyle(() => {
    const op = interpolate(
      scrollY.value,
      [HERO_HEIGHT * 0.4, HERO_HEIGHT * 0.7],
      [1, 0],
      Extrapolation.CLAMP
    );
    return { opacity: op };
  });
  const stickyBackdropStyle = useAnimatedStyle(() => {
    const op = interpolate(
      scrollY.value,
      [HERO_HEIGHT - HEADER_HEIGHT - 100, HERO_HEIGHT - HEADER_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity: op };
  });
  // Pair the wrapper's opacity fade with an actual intensity ramp so iOS does
  // not keep blurring at full strength when the header backdrop is invisible.
  const headerBlurProps = useAnimatedProps(() => {
    const intensity = interpolate(
      scrollY.value,
      [HERO_HEIGHT - HEADER_HEIGHT - 100, HERO_HEIGHT - HEADER_HEIGHT],
      [0, 50],
      Extrapolation.CLAMP
    );
    return { intensity };
  });
  const stickyTitleStyle = useAnimatedStyle(() => {
    const op = interpolate(
      scrollY.value,
      [HERO_HEIGHT - HEADER_HEIGHT - 60, HERO_HEIGHT - HEADER_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP
    );
    const ty = interpolate(
      scrollY.value,
      [HERO_HEIGHT - HEADER_HEIGHT - 60, HERO_HEIGHT - HEADER_HEIGHT],
      [10, 0],
      Extrapolation.CLAMP
    );
    return { opacity: op, transform: [{ translateY: ty }] };
  });

  const browseLabel = useMemo(() => {
    const platform = isSupportedBrowseSource(browseSource) ? browseSource : 'bangumi';
    return PLATFORM_CONFIGS[platform]?.displayName ?? 'Browse';
  }, [browseSource]);

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

  const handleSearchChange = useCallback(
    (text: string) => setView({ spotSearchQuery: text }),
    [setView]
  );
  const handleSearchClear = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setView({ spotSearchQuery: '' });
  }, [setView]);

  const handleSpotFilterChange = useCallback(
    (filter: import('../../../libs/services/pilgrimage/pilgrimage-detail-filter').PilgrimageSpotFilter) => {
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

  const isEmpty = !loading && !error && (!anime || points.length === 0);

  const heroAndControls = (
    <PilgrimageDetailHeader
      anime={anime}
      animeTitles={animeTitles}
      animeSubtitle={animeSubtitle}
      browseLabel={browseLabel}
      filteredGroupedSpotsLength={filteredGroupedSpots.length}
      filteredMappablePointCount={filteredMappablePointCount}
      groupedCounts={groupedCounts}
      hasSeriesSwitcher={hasSeriesSwitcher}
      heroAnimatedStyle={heroAnimatedStyle}
      heroContentStyle={heroContentStyle}
      isEmpty={isEmpty}
      normalizedSpotSearchQuery={normalizedSpotSearchQuery}
      onOpenBrowse={handleOpenBrowse}
      onSearchChange={handleSearchChange}
      onSearchClear={handleSearchClear}
      onSeriesSelect={handleSeriesSelect}
      onSpotFilterChange={handleSpotFilterChange}
      onViewPresetChange={handleViewPresetChange}
      posterUri={posterUri}
      seriesEntries={seriesEntries}
      effectiveSeriesSelection={effectiveSeriesSelection}
      availableSeriesEntriesCount={availableSeriesEntries.length}
      spotFilter={spotFilter}
      spotSearchQuery={spotSearchQuery}
      spotStats={spotStats}
      userStats={userStats}
      activeViewPreset={activeViewPreset}
      styles={styles}
      theme={theme}
      themeColor={themeColor}
      themeColorFg={themeColorFg}
    />
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />

        {/* Sticky animated header (always rendered, backdrop fades in). */}
        <View style={styles.headerWrap} pointerEvents="box-none">
          <Animated.View style={[styles.headerBackdrop, stickyBackdropStyle]} pointerEvents="none">
            <AnimatedBlurView
              animatedProps={headerBlurProps}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: `${theme.background.primary}D9` },
              ]}
            />
            <View style={[styles.headerBackdropBorder, { backgroundColor: theme.glassBorder }]} />
          </Animated.View>

          <Animated.View style={[styles.headerStickyTitle, stickyTitleStyle]} pointerEvents="none">
            <ThemedText variant="titleMedium" weight="700" numberOfLines={1}>
              {animeTitles?.primary ?? 'Pilgrimage'}
            </ThemedText>
          </Animated.View>

          <View style={styles.headerActions}>
            <RoundHeaderButton
              icon="chevron-back"
              onPress={handleBack}
              accessibilityLabel="Back"
              tint={theme.text.primary}
              theme={theme}
            />
            <View style={styles.headerRightGroup}>
              <RoundHeaderButton
                icon="camera-outline"
                onPress={handleOpenAlbum}
                accessibilityLabel="Open pilgrimage album"
                tint={themeColor}
                theme={theme}
              />
              <RoundHeaderButton
                icon="share-outline"
                onPress={handleShare}
                accessibilityLabel="Share"
                tint={theme.text.primary}
                theme={theme}
              />
            </View>
          </View>
        </View>

        {loading ? (
          <View>
            <Skeleton.HeroDetail showEpisodes={false} />
            <View style={{ paddingHorizontal: 16 }}>
              <Skeleton.AnimeCardList count={5} />
            </View>
          </View>
        ) : error ? (
          <SafeAreaView style={styles.errorContainer}>
            <ThemedText variant="titleMedium" weight="700" align="center">
              Couldn&apos;t load pilgrimage
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
                Go back
              </ThemedText>
            </Pressable>
          </SafeAreaView>
        ) : viewMode === 'map' ? (
          <Animated.ScrollView
            onScroll={animatedScrollHandler}
            scrollEventThrottle={16}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}>
            {heroAndControls}
            {isEmpty ? (
              <PilgrimageEmptyCard styles={styles} theme={theme} />
            ) : (
              <>
                {filteredGroupedSpots.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.spotChipRow}>
                    {filteredGroupedSpots.map((gs) => {
                      const rep = representativeForGroup(gs);
                      return (
                        <SpotChip
                          key={gs.id}
                          spot={rep}
                          active={gs.scenes.some((p) => p.id === selectedSpotId)}
                          themeColor={themeColor}
                          themeColorFg={themeColorFg}
                          distanceKm={distanceForGroup(gs)}
                          visited={gs.scenes.some((p) => visited[p.id] === true)}
                          saved={hasIntentForGroup(gs, 'saved')}
                          planned={hasIntentForGroup(gs, 'planned')}
                          hasCapture={gs.scenes.some((p) => !!captures[p.id])}
                          theme={theme}
                          onPress={handleSpotChipPress}
                        />
                      );
                    })}
                  </ScrollView>
                ) : null}
                <View
                  style={[
                    styles.mapWrap,
                    { borderColor: theme.glassBorder, backgroundColor: theme.background.secondary },
                  ]}>
                  <SpotMapView
                    spots={filteredPoints}
                    visited={visited}
                    ringColor={themeColor}
                    userLocation={userLocation}
                    centerGeo={anime?.geo ?? null}
                    centerZoom={anime?.zoom ?? 12}
                    markerMode={mapMarkerMode}
                    offlineOnly={mapOfflineOnly}
                    focusSpotId={selectedSpotId}
                    theme={theme}
                    onSpotPress={openSpot}
                    onClusterPick={openCluster}
                    style={styles.mapInner}
                  />
                  <View style={styles.mapOptionsDock} pointerEvents="box-none">
                    <LayoutModeButton
                      icon={mapMarkerMode === 'photo' ? 'image-outline' : 'ellipse'}
                      active={mapMarkerMode === 'dot'}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      accessibilityLabel={
                        mapMarkerMode === 'photo' ? 'Use dot map markers' : 'Use photo map markers'
                      }
                      onPress={handleMarkerModeToggle}
                    />
                    <LayoutModeButton
                      icon="cloud-offline-outline"
                      active={mapOfflineOnly}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      accessibilityLabel="Use cached map tiles only"
                      onPress={handleOfflineToggle}
                    />
                  </View>
                </View>
              </>
            )}
          </Animated.ScrollView>
        ) : isEmpty ? (
          <Animated.ScrollView
            onScroll={animatedScrollHandler}
            scrollEventThrottle={16}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}>
            {heroAndControls}
            <PilgrimageEmptyCard styles={styles} theme={theme} />
          </Animated.ScrollView>
        ) : (
          <PilgrimageList
            layout={listLayout}
            data={filteredGroupedSpots}
            visited={visited}
            captures={captures}
            spotIntents={spotIntents}
            themeColor={themeColor}
            themeColorFg={themeColorFg}
            theme={theme}
            representativeForGroup={representativeForGroup}
            distanceForGroup={distanceForGroup}
            hasIntentForGroup={hasIntentForGroup}
            onSpotPress={openGroup}
            onToggleVisited={toggleGroupedVisited}
            onOpenMaps={handleOpenMaps}
            onTakeComparison={handleFrameShot}
            ListHeaderComponent={heroAndControls}
            onScroll={handleListScroll}
            contentContainerStyle={styles.flashContent}
            emptyMessage={
              normalizedSpotSearchQuery
                ? 'No spots match this search.'
                : 'No scenes match this filter.'
            }
          />
        )}

        <SpotSheet
          spot={activeSpot}
          scenes={activeSpotScenes}
          sceneCount={activeSpotSceneCount}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          distanceKm={activeSpotDistance}
          visitedTarget={activeSpotVisitedTarget}
          visited={activeSpotVisited}
          saved={activeSpotSaved}
          planned={activeSpotPlanned}
          hasCapture={activeSpotHasCapture}
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

