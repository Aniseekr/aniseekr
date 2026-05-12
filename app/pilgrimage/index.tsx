// Pilgrimage hub. Matches japanwalker.pen Screen 1 (q3N3pG):
// Header (聖地巡禮 + map/list segmented + search) → Plan your day intro →
// Nearby hero (170h with grid + scatter pins) → Popular Animes rail (128x200)
// → Featured Spots list (72 photo + info + 56 mini map).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../libs/services/pilgrimage/featured-anime';
import { locationService, type LatLng } from '../../libs/services/pilgrimage/location-service';
import { loadVisitedSpots, type VisitedMap } from '../../libs/services/pilgrimage/visited-prefs';
import { ThemedText, readableTextOn } from '../../components/themed';
import type { AnitabiBangumi, AnitabiPoint } from '../../libs/services/pilgrimage/types';

interface FeaturedSpot {
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  distanceKm?: number;
}

function isValidGeo(
  geo: readonly [number, number] | null | undefined
): geo is readonly [number, number] {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export default function PilgrimageHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accentFg = readableTextOn(theme.accent);

  const [animes, setAnimes] = useState<AnitabiBangumi[]>([]);
  const [visited, setVisited] = useState<VisitedMap>({});
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'map' | 'list'>('map');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled(
      FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
        pilgrimageRepository.getSpotsByBangumiId(bangumiId)
      )
    )
      .then((results) => {
        if (cancelled) return;
        const fulfilled = results
          .filter(
            (r): r is PromiseFulfilledResult<AnitabiBangumi | null> =>
              r.status === 'fulfilled'
          )
          .map((r) => r.value)
          .filter((v): v is AnitabiBangumi => v !== null)
          .sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0));
        setAnimes(fulfilled);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadVisitedSpots().then((m) => {
      if (!cancelled) setVisited(m);
    });
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

  const allSpots = useMemo<FeaturedSpot[]>(() => {
    const list: FeaturedSpot[] = [];
    for (const anime of animes) {
      if (!anime.litePoints) continue;
      for (const spot of anime.litePoints) {
        if (!isValidGeo(spot.geo)) continue;
        let distanceKm: number | undefined;
        if (userLocation) {
          const d = locationService.getDistanceKm(userLocation, {
            latitude: spot.geo[0],
            longitude: spot.geo[1],
          });
          if (Number.isFinite(d)) distanceKm = d;
        }
        list.push({ spot, anime, distanceKm });
      }
    }
    return list;
  }, [animes, userLocation]);

  const nearest = useMemo<FeaturedSpot | null>(() => {
    const sorted = allSpots
      .filter((x) => x.distanceKm !== undefined)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    return sorted[0] ?? null;
  }, [allSpots]);

  const featuredSpots = useMemo<FeaturedSpot[]>(() => {
    if (allSpots.length === 0) return [];
    const withDistance = allSpots
      .filter((x) => x.distanceKm !== undefined)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .slice(0, 6);
    if (withDistance.length >= 4) return withDistance;
    return allSpots.slice(0, 6);
  }, [allSpots]);

  const handleAnimePress = useCallback(
    (anime: AnitabiBangumi) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(`/pilgrimage/${anime.id}`);
    },
    [router]
  );

  const handleOpenMap = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    if (animes.length > 0) {
      router.push(`/pilgrimage/${animes[0].id}`);
    }
  }, [animes, router]);

  const handleSearch = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/search');
  }, [router]);

  const handleOpenAlbum = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/pilgrimage/album');
  }, [router]);

  const handleToggleMode = useCallback(
    (next: 'map' | 'list') => {
      Haptics.selectionAsync().catch(() => undefined);
      setMode(next);
    },
    []
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.headerBar}>
          <ThemedText variant="titleLarge" weight="700" style={styles.headerTitle}>
            聖地巡禮
          </ThemedText>
          <View style={styles.headerRight}>
            <View style={styles.segment}>
              <Pressable
                onPress={() => handleToggleMode('map')}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="Map view"
                style={[
                  styles.segmentBtn,
                  mode === 'map' && { backgroundColor: theme.background.tertiary },
                ]}>
                <Ionicons
                  name="map"
                  size={13}
                  color={mode === 'map' ? theme.text.primary : theme.text.tertiary}
                />
                <ThemedText
                  variant="captionSmall"
                  weight="600"
                  style={{
                    color: mode === 'map' ? theme.text.primary : theme.text.tertiary,
                  }}>
                  Map
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => handleToggleMode('list')}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="List view"
                style={[
                  styles.segmentBtn,
                  mode === 'list' && { backgroundColor: theme.background.tertiary },
                ]}>
                <Ionicons
                  name="list"
                  size={13}
                  color={mode === 'list' ? theme.text.primary : theme.text.tertiary}
                />
                <ThemedText
                  variant="captionSmall"
                  weight="600"
                  style={{
                    color: mode === 'list' ? theme.text.primary : theme.text.tertiary,
                  }}>
                  List
                </ThemedText>
              </Pressable>
            </View>
            <Pressable
              onPress={handleSearch}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Search"
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
              <Ionicons name="search" size={18} color={theme.text.primary} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 120 },
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={[styles.introCaps, { color: theme.accent }]}>
              PLAN YOUR DAY
            </ThemedText>
            <ThemedText variant="bodySmall" style={styles.introBody}>
              Choose an anime and find walkable spots near you.
            </ThemedText>
          </View>

          <NearbyHero
            theme={theme}
            nearest={nearest}
            hasLocation={!!userLocation}
            onPress={handleOpenMap}
          />

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={20} color={theme.status.warning} />
              <ThemedText variant="bodySmall" tone="secondary" align="center">
                {error}
              </ThemedText>
            </View>
          ) : null}

          {animes.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title="Popular Animes"
                cta="See all"
                onCta={handleOpenAlbum}
                theme={theme}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.popularRow}>
                {animes.slice(0, 12).map((anime) => (
                  <PopularCard
                    key={anime.id}
                    anime={anime}
                    visited={visited}
                    accent={theme.accent}
                    accentFg={accentFg}
                    theme={theme}
                    onPress={() => handleAnimePress(anime)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {featuredSpots.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title="Featured Spots"
                cta="View map"
                onCta={handleOpenMap}
                theme={theme}
              />
              <View style={styles.spotList}>
                {featuredSpots.map(({ spot, anime, distanceKm }) => (
                  <FeaturedSpotRow
                    key={spot.id}
                    spot={spot}
                    anime={anime}
                    distanceKm={distanceKm}
                    theme={theme}
                    onPress={() => handleAnimePress(anime)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function NearbyHero({
  theme,
  nearest,
  hasLocation,
  onPress,
}: {
  theme: ThemePalette;
  nearest: FeaturedSpot | null;
  hasLocation: boolean;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const fgPin = readableTextOn(theme.accent);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Nearby pilgrimage spots"
      style={({ pressed }) => [styles.heroCard, pressed && { opacity: 0.92 }]}>
      {/* grid background */}
      <View style={styles.heroGrid} pointerEvents="none">
        {[60, 130, 200, 270, 330].map((x) => (
          <View
            key={`v${x}`}
            style={[
              styles.gridLineV,
              { left: x, backgroundColor: theme.glassBorder },
            ]}
          />
        ))}
        {[34, 68, 102, 136].map((y) => (
          <View
            key={`h${y}`}
            style={[
              styles.gridLineH,
              { top: y, backgroundColor: theme.glassBorder },
            ]}
          />
        ))}
        <View
          style={[
            styles.roadPath,
            {
              backgroundColor: theme.glassBorder,
              opacity: 0.55,
            },
          ]}
        />
      </View>

      {/* satellite pins */}
      <View
        style={[
          styles.satPin,
          { left: 78, top: 48, backgroundColor: theme.background.tertiary },
        ]}
      />
      <View
        style={[
          styles.satPin,
          {
            left: 266,
            top: 34,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: theme.background.tertiary,
          },
        ]}
      />
      <View
        style={[
          styles.satPin,
          {
            left: 118,
            top: 118,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: theme.background.tertiary,
          },
        ]}
      />

      {/* primary accent pin */}
      <View
        style={[
          styles.primaryPin,
          {
            backgroundColor: theme.accent,
            borderColor: theme.background.primary,
            shadowColor: theme.accent,
          },
        ]}>
        <Ionicons name="location" size={12} color={fgPin} />
      </View>

      {/* bottom overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)']}
        style={styles.heroOverlay}
        pointerEvents="none"
      />
      <View style={styles.heroBody}>
        <View style={styles.heroLabelRow}>
          <View
            style={[
              styles.heroPinBadge,
              { backgroundColor: theme.background.tertiary },
            ]}>
            <Ionicons name="location" size={11} color={theme.text.primary} />
          </View>
          <ThemedText variant="bodySmall" weight="700">
            Nearby Pilgrimage Spots
          </ThemedText>
        </View>
        <ThemedText variant="captionSmall" tone="secondary" style={{ marginTop: 4 }}>
          {hasLocation
            ? nearest
              ? `Nearest: ${formatKm(nearest.distanceKm!)} · ${nearest.spot.cn || nearest.spot.name}`
              : 'No mapped spots within range yet'
            : 'Enable location to surface walking-distance spots'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function SectionHeader({
  title,
  cta,
  onCta,
  theme,
}: {
  title: string;
  cta?: string;
  onCta?: () => void;
  theme: ThemePalette;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.sectionHeader}>
      <ThemedText variant="titleMedium" weight="700">
        {title}
      </ThemedText>
      {cta && onCta ? (
        <Pressable
          onPress={onCta}
          hitSlop={10}
          style={({ pressed }) => [styles.sectionCta, pressed && { opacity: 0.6 }]}>
          <ThemedText variant="captionSmall" weight="500" tone="secondary">
            {cta}
          </ThemedText>
          <Ionicons name="chevron-forward" size={12} color={theme.text.tertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function PopularCard({
  anime,
  visited,
  accent,
  accentFg,
  theme,
  onPress,
}: {
  anime: AnitabiBangumi;
  visited: VisitedMap;
  accent: string;
  accentFg: string;
  theme: ThemePalette;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const total = anime.pointsLength ?? 0;
  const visitedCount = (anime.litePoints ?? []).filter((p) => visited[p.id]).length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${anime.cn || anime.title} pilgrimage`}
      style={({ pressed }) => [styles.popularCard, pressed && { opacity: 0.9 }]}>
      <View style={styles.popularPosterWrap}>
        <Image
          source={{ uri: anime.cover }}
          style={styles.popularPoster}
          contentFit="cover"
          transition={180}
        />
        <View style={[styles.popularBadge, { backgroundColor: `${accent}E6` }]}>
          <ThemedText variant="captionSmall" weight="700" style={{ color: accentFg, fontSize: 10 }}>
            {total} spots
          </ThemedText>
        </View>
        {visitedCount > 0 ? (
          <View style={styles.popularVisited}>
            <Ionicons name="checkmark" size={10} color={theme.status.success} />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: theme.status.success, fontSize: 9 }}>
              {visitedCount}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.popularMeta}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          numberOfLines={1}
          style={{ fontSize: 12 }}>
          {anime.cn || anime.title}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          tone="tertiary"
          numberOfLines={1}
          style={{ fontSize: 10 }}>
          {anime.city || '—'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function FeaturedSpotRow({
  spot,
  anime,
  distanceKm,
  theme,
  onPress,
}: {
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  distanceKm?: number;
  theme: ThemePalette;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${spot.cn || spot.name} from ${anime.cn || anime.title}`}
      style={({ pressed }) => [styles.spotRow, pressed && { opacity: 0.92 }]}>
      <Image
        source={{ uri: spot.image }}
        style={styles.spotThumb}
        contentFit="cover"
        transition={150}
      />
      <View style={styles.spotBody}>
        <ThemedText variant="bodySmall" weight="700" numberOfLines={1}>
          {spot.cn || spot.name}
        </ThemedText>
        <View style={styles.spotMetaRow}>
          <Ionicons name="film-outline" size={10} color={theme.text.tertiary} />
          <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
            {anime.cn || anime.title}
          </ThemedText>
        </View>
        {distanceKm !== undefined ? (
          <View style={styles.spotDistRow}>
            <Ionicons name="navigate" size={10} color={theme.accent} />
            <ThemedText variant="captionSmall" weight="600" style={{ color: theme.accent }}>
              {formatKm(distanceKm)}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={[styles.miniMap, { backgroundColor: theme.background.tertiary }]}>
        <LinearGradient
          colors={[`${theme.accent}1F`, 'rgba(0,0,0,0.0)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.miniMapPin, { backgroundColor: theme.accent }]} />
      </View>
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 12,
    },
    headerTitle: {
      fontSize: 22,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    segment: {
      flexDirection: 'row',
      borderRadius: 16,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      padding: 4,
      gap: 2,
    },
    segmentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 20,
      gap: 22,
    },
    intro: {
      gap: 4,
    },
    introCaps: {
      letterSpacing: 1.2,
      fontSize: 12,
    },
    introBody: {
      lineHeight: 18,
    },
    heroCard: {
      height: 170,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    heroGrid: {
      ...StyleSheet.absoluteFillObject,
    },
    gridLineV: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 1,
      opacity: 0.5,
    },
    gridLineH: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      opacity: 0.5,
    },
    roadPath: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 90,
      height: 2,
      transform: [{ rotate: '-4deg' }],
    },
    satPin: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
      opacity: 0.85,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    primaryPin: {
      position: 'absolute',
      left: '50%',
      top: '40%',
      marginLeft: -14,
      marginTop: -14,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 6,
    },
    heroOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 78,
    },
    heroBody: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 14,
    },
    heroLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    heroPinBadge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingBox: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      backgroundColor: `${theme.status.warning}14`,
      borderColor: `${theme.status.warning}55`,
      borderWidth: 1,
      borderRadius: 14,
    },
    section: {
      gap: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    popularRow: {
      gap: 12,
      paddingRight: 4,
    },
    popularCard: {
      width: 128,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    popularPosterWrap: {
      height: 148,
      width: '100%',
      backgroundColor: theme.background.tertiary,
    },
    popularPoster: {
      width: '100%',
      height: '100%',
    },
    popularBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
    },
    popularVisited: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: `${theme.status.success}66`,
    },
    popularMeta: {
      padding: 8,
      paddingHorizontal: 10,
      gap: 2,
    },
    spotList: {
      gap: 10,
    },
    spotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 10,
      borderRadius: 14,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    spotThumb: {
      width: 72,
      height: 72,
      borderRadius: 10,
      backgroundColor: theme.background.tertiary,
    },
    spotBody: {
      flex: 1,
      gap: 3,
    },
    spotMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    spotDistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    miniMap: {
      width: 56,
      height: 56,
      borderRadius: 10,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    miniMapPin: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
  });
}
