import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  PilgrimageMapView,
  type PilgrimageMapAnime,
} from '../../components/pilgrimage/PilgrimageMapView';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../libs/services/pilgrimage/featured-anime';
import { locationService, type LatLng } from '../../libs/services/pilgrimage/location-service';
import {
  collectionPilgrimageService,
  type CollectionPilgrimageEntry,
  type CollectionStatus,
} from '../../libs/services/pilgrimage/collection-pilgrimage-service';
import { loadVisitedSpots, type VisitedMap } from '../../libs/services/pilgrimage/visited-prefs';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';

type FilterMode = 'all' | 'mine' | 'visited';

interface DisplayItem {
  anime: AnitabiBangumi;
  inCollection: boolean;
  status?: CollectionStatus;
  isFavorite?: boolean;
  distanceKm?: number;
  visitedCount: number;
}

const STATUS_LABELS: Record<CollectionStatus, string> = {
  watching: 'Watching',
  completed: 'Completed',
  on_hold: 'On Hold',
  dropped: 'Dropped',
  plan_to_watch: 'Plan to Watch',
};

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function isValidGeo(
  geo: readonly [number, number] | null | undefined
): geo is readonly [number, number] {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

export default function PilgrimageHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [mapOpen, setMapOpen] = useState(false);
  const [featured, setFeatured] = useState<AnitabiBangumi[]>([]);
  const [collected, setCollected] = useState<CollectionPilgrimageEntry[]>([]);
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [visited, setVisited] = useState<VisitedMap>({});
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [loadingMine, setLoadingMine] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingFeatured(true);
    setError(null);

    Promise.allSettled(
      FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
        pilgrimageRepository.getSpotsByBangumiId(bangumiId)
      )
    )
      .then((results) => {
        if (cancelled) return;
        const fulfilled = results
          .filter(
            (r): r is PromiseFulfilledResult<AnitabiBangumi | null> => r.status === 'fulfilled'
          )
          .map((r) => r.value)
          .filter((v): v is AnitabiBangumi => v !== null)
          .sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0));
        setFeatured(fulfilled);
        setLoadingFeatured(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load pilgrimage data';
        setError(message);
        setLoadingFeatured(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingMine(true);

    Promise.all([collectionPilgrimageService.getEntries(), collectionPilgrimageService.getStats()])
      .then(([entries, stats]) => {
        if (cancelled) return;
        setCollected(entries);
        setCollectionTotal(stats.total);
        setLoadingMine(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCollected([]);
        setCollectionTotal(0);
        setLoadingMine(false);
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

  // Eagerly request location so the Nearby section can populate as soon as the
  // page mounts. Failures (denied permission etc.) are silent — Nearby is
  // simply hidden when no location is available.
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

  const allItems = useMemo<DisplayItem[]>(() => {
    const collectedById = new Map(collected.map((e) => [e.bangumiId, e]));
    const collectedIds = new Set(collected.map((e) => e.bangumiId));

    const visitedCountFor = (anime: AnitabiBangumi): number => {
      if (!anime.litePoints) return 0;
      let n = 0;
      for (const p of anime.litePoints) if (visited[p.id]) n++;
      return n;
    };

    const distanceFor = (anime: AnitabiBangumi): number | undefined => {
      if (!userLocation || !isValidGeo(anime.geo)) return undefined;
      const d = locationService.getDistanceKm(userLocation, {
        latitude: anime.geo[0],
        longitude: anime.geo[1],
      });
      return Number.isFinite(d) ? d : undefined;
    };

    const featuredIds = new Set(featured.map((a) => a.id));
    const merged: AnitabiBangumi[] = [...featured];
    for (const e of collected) {
      if (!featuredIds.has(e.bangumiId)) merged.push(e.anime);
    }

    return merged.map((anime) => {
      const c = collectedById.get(anime.id);
      return {
        anime,
        inCollection: collectedIds.has(anime.id),
        status: c?.status,
        isFavorite: c?.isFavorite,
        distanceKm: distanceFor(anime),
        visitedCount: visitedCountFor(anime),
      };
    });
  }, [featured, collected, visited, userLocation]);

  const filteredItems = useMemo(() => {
    if (filter === 'mine') return allItems.filter((i) => i.inCollection);
    if (filter === 'visited') return allItems.filter((i) => i.visitedCount > 0);
    return allItems;
  }, [allItems, filter]);

  const visitedCount = useMemo(
    () => allItems.filter((i) => i.visitedCount > 0).length,
    [allItems]
  );

  const mineCount = useMemo(() => allItems.filter((i) => i.inCollection).length, [allItems]);

  const nearbyItems = useMemo(() => {
    if (!userLocation) return [];
    return [...filteredItems]
      .filter((i) => i.distanceKm !== undefined)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .slice(0, 8);
  }, [filteredItems, userLocation]);

  const popularItems = useMemo(() => {
    return [...filteredItems]
      .sort((a, b) => (b.anime.pointsLength ?? 0) - (a.anime.pointsLength ?? 0))
      .slice(0, 6);
  }, [filteredItems]);

  const mineItems = useMemo(() => allItems.filter((i) => i.inCollection), [allItems]);

  const heroAnime = useMemo<AnitabiBangumi | null>(
    () => popularItems[0]?.anime ?? null,
    [popularItems]
  );

  const mapEntries = useMemo<PilgrimageMapAnime[]>(
    () =>
      filteredItems.map((i) => ({
        anime: i.anime,
        inCollection: i.inCollection,
        distanceKm: i.distanceKm,
      })),
    [filteredItems]
  );

  const handleAnimePress = useCallback(
    (anime: AnitabiBangumi) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(`/pilgrimage/${anime.id}`);
    },
    [router]
  );

  const handleFilterChange = useCallback((mode: FilterMode) => {
    Haptics.selectionAsync().catch(() => undefined);
    setFilter(mode);
  }, []);

  const handleOpenMap = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setMapOpen(true);
  }, []);

  const handleOpenSearch = useCallback(() => {
    router.push('/search');
  }, [router]);

  const isInitialLoading = (loadingFeatured || loadingMine) && allItems.length === 0;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Colors.gradients.background as unknown as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.bgGlowPrimary} pointerEvents="none" />
      <View style={styles.bgGlowSecondary} pointerEvents="none" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <HeroHeader
          insetTop={insets.top}
          heroAnime={heroAnime}
          filter={filter}
          counts={{ all: allItems.length, mine: mineCount, visited: visitedCount }}
          onFilterChange={handleFilterChange}
          onOpenMap={handleOpenMap}
          onOpenSearch={handleOpenSearch}
        />

        <MiniMapTeaser onPress={handleOpenMap} />

        {isInitialLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading pilgrimage data…</Text>
          </View>
        ) : null}

        {nearbyItems.length > 0 ? (
          <Section title="近くのスポット" subtitle="Closest locations to you">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}>
              {nearbyItems.map((item) => (
                <NearbyCard
                  key={`nearby-${item.anime.id}`}
                  item={item}
                  onPress={handleAnimePress}
                />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {popularItems.length > 0 ? (
          <Section title="人気の聖地巡礼" subtitle="Popular anime pilgrimages">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}>
              {popularItems.map((item) => (
                <PopularCard
                  key={`popular-${item.anime.id}`}
                  item={item}
                  onPress={handleAnimePress}
                />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {filter !== 'mine' && mineItems.length > 0 ? (
          <Section
            title="マイコレクション"
            subtitle={`${mineItems.length} of ${collectionTotal} have spots`}>
            <View style={styles.mineList}>
              {mineItems.slice(0, 6).map((item) => (
                <MineRow key={`mine-${item.anime.id}`} item={item} onPress={handleAnimePress} />
              ))}
            </View>
          </Section>
        ) : null}

        {!isInitialLoading && filteredItems.length === 0 ? (
          <EmptyState filter={filter} error={error} />
        ) : null}

        <View style={{ height: 140 }} />
      </ScrollView>

      <MapModal
        visible={mapOpen}
        onClose={() => setMapOpen(false)}
        entries={mapEntries}
        userLocation={userLocation}
        onMarkerPress={(a) => {
          setMapOpen(false);
          handleAnimePress(a);
        }}
      />
    </View>
  );
}

interface HeroHeaderProps {
  insetTop: number;
  heroAnime: AnitabiBangumi | null;
  filter: FilterMode;
  counts: { all: number; mine: number; visited: number };
  onFilterChange: (mode: FilterMode) => void;
  onOpenMap: () => void;
  onOpenSearch: () => void;
}

function HeroHeader({
  insetTop,
  heroAnime,
  filter,
  counts,
  onFilterChange,
  onOpenMap,
  onOpenSearch,
}: HeroHeaderProps) {
  return (
    <View style={[styles.hero, { paddingTop: insetTop + 12 }]}>
      <View style={StyleSheet.absoluteFillObject}>
        {heroAnime?.cover ? (
          <Image
            source={{ uri: heroAnime.cover.replace('?plan=h160', '?plan=h720') }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={300}
          />
        ) : null}
        <LinearGradient
          colors={['rgba(8,8,8,0.35)', 'rgba(8,8,8,0.78)', '#080808']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[`${Colors.primary}1A`, 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.heroHeaderRow}>
        <View style={styles.heroLogoBlock}>
          <Text style={styles.heroLogo} accessibilityRole="header">
            聖地巡礼
          </Text>
          <Text style={styles.heroTagline}>Anime locations across Japan</Text>
        </View>
        <View style={styles.heroIcons}>
          <RoundIconBtn icon="map" onPress={onOpenMap} accessibilityLabel="Open map" />
          <RoundIconBtn icon="search" onPress={onOpenSearch} accessibilityLabel="Search anime" />
        </View>
      </View>

      <View style={styles.pillRow}>
        <FilterPill
          label="All"
          active={filter === 'all'}
          count={counts.all}
          onPress={() => onFilterChange('all')}
        />
        <FilterPill
          label="Mine"
          active={filter === 'mine'}
          count={counts.mine}
          onPress={() => onFilterChange('mine')}
        />
        <FilterPill
          label="Visited"
          active={filter === 'visited'}
          count={counts.visited}
          onPress={() => onFilterChange('visited')}
        />
      </View>
    </View>
  );
}

interface RoundIconBtnProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
}

function RoundIconBtn({ icon, onPress, accessibilityLabel }: RoundIconBtnProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [styles.roundBtn, pressed && { opacity: 0.78 }]}>
      <Ionicons name={icon} size={18} color={Colors.primary} />
    </Pressable>
  );
}

interface FilterPillProps {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}

function FilterPill({ label, count, active, onPress }: FilterPillProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        pillStyles.pill,
        active ? pillStyles.pillActive : pillStyles.pillInactive,
        pressed && { opacity: 0.85 },
      ]}>
      <Text style={[pillStyles.label, { color: active ? '#000' : Colors.text.primary }]}>
        {label}
      </Text>
      <View
        style={[
          pillStyles.countBadge,
          { backgroundColor: active ? 'rgba(0,0,0,0.18)' : Colors.glass.medium },
        ]}>
        <Text style={[pillStyles.countText, { color: active ? '#000' : Colors.text.secondary }]}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function MiniMapTeaser({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open the full pilgrimage map"
      style={({ pressed }) => [styles.miniMap, pressed && { opacity: 0.85 }]}>
      <LinearGradient
        colors={[`${Colors.primary}30`, 'rgba(20,20,22,0.85)', `${Colors.secondary}28`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.miniMapPattern} pointerEvents="none">
        <Ionicons
          name="location"
          size={18}
          color={`${Colors.primary}CC`}
          style={[styles.miniMapPin, { top: 14, left: 28 }]}
        />
        <Ionicons
          name="location"
          size={16}
          color={`${Colors.text.primary}66`}
          style={[styles.miniMapPin, { top: 38, left: 130 }]}
        />
        <Ionicons
          name="location"
          size={20}
          color={Colors.primary}
          style={[styles.miniMapPin, { top: 52, right: 56 }]}
        />
        <Ionicons
          name="location"
          size={16}
          color={`${Colors.secondary}AA`}
          style={[styles.miniMapPin, { bottom: 36, left: 70 }]}
        />
        <Ionicons
          name="location"
          size={18}
          color={`${Colors.primary}DD`}
          style={[styles.miniMapPin, { bottom: 26, right: 36 }]}
        />
        <View style={styles.miniMapCenterIcon}>
          <Ionicons name="map" size={26} color={Colors.text.primary} />
        </View>
      </View>
      <View style={styles.miniMapLabelRow}>
        <Ionicons name="navigate" size={12} color={Colors.primary} />
        <Text style={styles.miniMapLabel}>Tap to explore the full map</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.text.secondary} />
      </View>
    </Pressable>
  );
}

interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function Section({ title, subtitle, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

interface CardItemProps {
  item: DisplayItem;
  onPress: (anime: AnitabiBangumi) => void;
}

function NearbyCard({ item, onPress }: CardItemProps) {
  const themeColor = item.anime.color || Colors.primary;
  return (
    <Pressable
      onPress={() => onPress(item.anime)}
      accessibilityRole="button"
      accessibilityLabel={`${item.anime.title}, ${item.distanceKm !== undefined ? formatDistance(item.distanceKm) : 'distance unknown'}`}
      style={({ pressed }) => [cardStyles.nearbyCard, pressed && { opacity: 0.85 }]}>
      {item.anime.cover ? (
        <Image
          source={{ uri: item.anime.cover.replace('?plan=h160', '?plan=h360') }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.background.secondary }]} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.92)']}
        locations={[0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      {item.inCollection ? (
        <View style={[cardStyles.tinyBadge, { backgroundColor: Colors.primary }]}>
          <Ionicons name="bookmark" size={9} color="#000" />
        </View>
      ) : null}
      <View style={cardStyles.nearbyText}>
        <Text style={cardStyles.nearbyTitle} numberOfLines={2}>
          {item.anime.title}
        </Text>
        <View style={cardStyles.nearbyMetaRow}>
          {item.distanceKm !== undefined ? (
            <>
              <Ionicons name="navigate" size={10} color={themeColor} />
              <Text style={[cardStyles.nearbyMeta, { color: themeColor }]}>
                {formatDistance(item.distanceKm)}
              </Text>
            </>
          ) : null}
          <Text style={cardStyles.nearbyMetaDim}>
            {item.distanceKm !== undefined ? '·' : ''} {item.anime.pointsLength} spots
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function PopularCard({ item, onPress }: CardItemProps) {
  const themeColor = item.anime.color || Colors.primary;
  return (
    <Pressable
      onPress={() => onPress(item.anime)}
      accessibilityRole="button"
      accessibilityLabel={item.anime.title}
      style={({ pressed }) => [cardStyles.popularCard, pressed && { opacity: 0.85 }]}>
      {item.anime.cover ? (
        <Image
          source={{ uri: item.anime.cover.replace('?plan=h160', '?plan=h720') }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.background.secondary }]} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        locations={[0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[cardStyles.spotBadge, { backgroundColor: `${themeColor}E6` }]}>
        <Text style={cardStyles.spotBadgeText}>{item.anime.pointsLength} spots</Text>
      </View>
      {item.inCollection ? (
        <View style={cardStyles.checkBadge}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
        </View>
      ) : null}
      <View style={cardStyles.popularText}>
        <Text style={cardStyles.popularTitle} numberOfLines={1}>
          {item.anime.title}
        </Text>
        {item.anime.cn ? (
          <Text style={cardStyles.popularSubtitle} numberOfLines={1}>
            {item.anime.cn}
          </Text>
        ) : null}
        <View style={cardStyles.popularMetaRow}>
          {item.anime.city ? (
            <View style={cardStyles.popularChip}>
              <Ionicons name="location" size={9} color={Colors.text.secondary} />
              <Text style={cardStyles.popularChipText}>{item.anime.city}</Text>
            </View>
          ) : null}
          {item.distanceKm !== undefined ? (
            <View style={[cardStyles.popularChip, { backgroundColor: `${themeColor}22` }]}>
              <Ionicons name="navigate" size={9} color={themeColor} />
              <Text style={[cardStyles.popularChipText, { color: themeColor }]}>
                {formatDistance(item.distanceKm)}
              </Text>
            </View>
          ) : null}
          {item.visitedCount > 0 ? (
            <View style={[cardStyles.popularChip, { backgroundColor: `${Colors.success}22` }]}>
              <Ionicons name="checkmark-circle" size={9} color={Colors.success} />
              <Text style={[cardStyles.popularChipText, { color: Colors.success }]}>
                {item.visitedCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function MineRow({ item, onPress }: CardItemProps) {
  const themeColor = item.anime.color || Colors.primary;
  const total = item.anime.pointsLength ?? 0;
  const visitedRatio = total > 0 ? Math.round((item.visitedCount / total) * 100) : 0;
  return (
    <Pressable
      onPress={() => onPress(item.anime)}
      accessibilityRole="button"
      accessibilityLabel={item.anime.title}
      style={({ pressed }) => [cardStyles.mineRow, pressed && { opacity: 0.85 }]}>
      {item.anime.cover ? (
        <Image
          source={{ uri: item.anime.cover.replace('?plan=h160', '?plan=h360') }}
          style={cardStyles.mineThumb}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View
          style={[cardStyles.mineThumb, { backgroundColor: Colors.background.secondary }]}
          pointerEvents="none"
        />
      )}
      <View style={cardStyles.mineBody}>
        <Text style={cardStyles.mineTitle} numberOfLines={1}>
          {item.anime.title}
        </Text>
        {item.anime.cn ? (
          <Text style={cardStyles.mineSubtitle} numberOfLines={1}>
            {item.anime.cn}
          </Text>
        ) : null}
        <View style={cardStyles.mineMetaRow}>
          {item.status ? (
            <Text style={[cardStyles.mineStatus, { color: themeColor }]}>
              {STATUS_LABELS[item.status]}
            </Text>
          ) : null}
          <Text style={cardStyles.mineMeta}>{total} spots</Text>
          {item.distanceKm !== undefined ? (
            <Text style={cardStyles.mineMeta}>· {formatDistance(item.distanceKm)}</Text>
          ) : null}
        </View>
        <View style={cardStyles.mineProgressTrack}>
          <View
            style={[
              cardStyles.mineProgressFill,
              { width: `${visitedRatio}%`, backgroundColor: themeColor },
            ]}
          />
        </View>
      </View>
      <View style={cardStyles.mineRight}>
        <Text style={[cardStyles.mineRatio, { color: themeColor }]}>{visitedRatio}%</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
      </View>
    </Pressable>
  );
}

interface EmptyStateProps {
  filter: FilterMode;
  error: string | null;
}

function EmptyState({ filter, error }: EmptyStateProps) {
  if (error) {
    return (
      <View style={emptyStyles.box}>
        <MaterialIcons name="error-outline" size={36} color={Colors.error} />
        <Text style={emptyStyles.title}>Couldn’t load pilgrimage data</Text>
        <Text style={emptyStyles.body}>{error}</Text>
      </View>
    );
  }
  if (filter === 'mine') {
    return (
      <View style={emptyStyles.box}>
        <MaterialIcons name="bookmark-border" size={36} color={Colors.text.tertiary} />
        <Text style={emptyStyles.title}>No matched anime in your collection</Text>
        <Text style={emptyStyles.body}>
          Add anime set in Japan to see them here. Switch to “All” to browse curated picks.
        </Text>
      </View>
    );
  }
  if (filter === 'visited') {
    return (
      <View style={emptyStyles.box}>
        <MaterialIcons name="hiking" size={36} color={Colors.text.tertiary} />
        <Text style={emptyStyles.title}>No visited spots yet</Text>
        <Text style={emptyStyles.body}>
          Open an anime page and tap the check icon next to a spot to mark it visited.
        </Text>
      </View>
    );
  }
  return (
    <View style={emptyStyles.box}>
      <MaterialIcons name="explore-off" size={36} color={Colors.text.tertiary} />
      <Text style={emptyStyles.title}>No pilgrimage data yet</Text>
      <Text style={emptyStyles.body}>
        Curated anime locations will appear here once available.
      </Text>
    </View>
  );
}

interface MapModalProps {
  visible: boolean;
  onClose: () => void;
  entries: PilgrimageMapAnime[];
  userLocation: LatLng | null;
  onMarkerPress: (anime: AnitabiBangumi) => void;
}

function MapModal({ visible, onClose, entries, userLocation, onMarkerPress }: MapModalProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}>
      <View style={mapModalStyles.root}>
        <LinearGradient
          colors={Colors.gradients.background as unknown as [string, string, ...string[]]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[mapModalStyles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close map"
            style={({ pressed }) => [mapModalStyles.closeBtn, pressed && { opacity: 0.78 }]}>
            <Ionicons name="close" size={22} color={Colors.text.primary} />
          </Pressable>
          <View style={mapModalStyles.headerText}>
            <Text style={mapModalStyles.title}>Pilgrimage map</Text>
            <Text style={mapModalStyles.subtitle}>
              {entries.length} {entries.length === 1 ? 'anime' : 'anime'} · tap a marker
            </Text>
          </View>
        </View>
        <View style={mapModalStyles.mapWrap}>
          {entries.length === 0 ? (
            <View style={mapModalStyles.empty}>
              <MaterialIcons name="explore-off" size={36} color={Colors.text.tertiary} />
              <Text style={emptyStyles.title}>No locations to plot yet</Text>
            </View>
          ) : (
            <PilgrimageMapView
              animeList={entries}
              userLocation={userLocation}
              onMarkerPress={onMarkerPress}
              style={mapModalStyles.map as StyleProp<ViewStyle>}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const HERO_MIN_HEIGHT = 280;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0 },
  bgGlowPrimary: {
    position: 'absolute',
    top: 220,
    right: -90,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(255, 159, 10, 0.10)',
    opacity: 0.7,
  },
  bgGlowSecondary: {
    position: 'absolute',
    bottom: 80,
    left: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(191, 90, 242, 0.10)',
    opacity: 0.6,
  },
  hero: {
    width: '100%',
    minHeight: HERO_MIN_HEIGHT,
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.lg,
    overflow: 'hidden',
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  heroLogoBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroLogo: {
    color: Colors.text.primary,
    ...Typography.displayLarge,
    fontSize: 32,
    letterSpacing: 1.2,
    textShadowColor: 'rgba(255, 159, 10, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  heroTagline: {
    color: Colors.text.secondary,
    marginTop: 4,
    ...Typography.bodySmall,
  },
  heroIcons: {
    flexDirection: 'row',
    gap: 10,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(40, 40, 44, 0.78)',
    borderWidth: 1,
    borderColor: `${Colors.primary}4D`,
  },
  pillRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  miniMap: {
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.lg,
    height: 170,
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.background.secondary,
    justifyContent: 'flex-end',
  },
  miniMapPattern: {
    ...StyleSheet.absoluteFillObject,
  },
  miniMapPin: {
    position: 'absolute',
  },
  miniMapCenterIcon: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: `${Colors.primary}66`,
  },
  miniMapLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(8,8,8,0.62)',
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  miniMapLabel: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingState: {
    paddingTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    color: Colors.text.secondary,
    ...Typography.bodyMedium,
  },
  section: {
    marginTop: Spacing.sectionSpacing,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    // Pen tightens section headers to 18/700 so they sit just under the hero
    // logo rather than competing with it; helps the rails read as content.
    color: Colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    color: Colors.text.tertiary,
    ...Typography.bodySmall,
    marginTop: 2,
  },
  horizontalList: {
    paddingHorizontal: Spacing.screenPadding,
    paddingRight: Spacing.screenPadding + 4,
    gap: Spacing.sm,
  },
  mineList: {
    paddingHorizontal: Spacing.screenPadding,
    gap: Spacing.sm,
  },
});

const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillInactive: {
    backgroundColor: 'rgba(40,40,44,0.62)',
    borderColor: Colors.glass.border,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  countBadge: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
  },
});

const cardStyles = StyleSheet.create({
  // Nearby card — small portrait spot card
  nearbyCard: {
    width: 156,
    height: 196,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.background.secondary,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    justifyContent: 'flex-end',
  },
  tinyBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyText: {
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 4,
  },
  nearbyTitle: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  nearbyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  nearbyMeta: {
    fontSize: 11,
    fontWeight: '700',
  },
  nearbyMetaDim: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '500',
  },

  // Popular card — landscape anime card
  popularCard: {
    width: 270,
    height: 168,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.background.secondary,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    justifyContent: 'flex-end',
  },
  spotBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  spotBadgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
  },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  popularText: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 4,
  },
  popularTitle: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  popularSubtitle: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '500',
  },
  popularMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  popularChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  popularChipText: {
    color: Colors.text.secondary,
    fontSize: 10,
    fontWeight: '600',
  },

  // Mine row — horizontal collection row with progress bar
  mineRow: {
    flexDirection: 'row',
    backgroundColor: Colors.glass.medium,
    borderRadius: Radius.lg,
    padding: 10,
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  mineThumb: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  mineBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  mineTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  mineSubtitle: {
    color: Colors.text.secondary,
    fontSize: 12,
  },
  mineMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  mineStatus: {
    fontSize: 11,
    fontWeight: '700',
  },
  mineMeta: {
    color: Colors.text.tertiary,
    fontSize: 11,
    fontWeight: '500',
  },
  mineProgressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: Colors.glass.dark,
    marginTop: 4,
  },
  mineProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  mineRight: {
    alignItems: 'center',
    gap: 2,
  },
  mineRatio: {
    fontSize: 13,
    fontWeight: '700',
  },
});

const emptyStyles = StyleSheet.create({
  box: {
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.glass.medium,
    borderColor: Colors.glass.border,
    borderWidth: 1,
    borderRadius: Radius.cardLg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    color: Colors.text.primary,
    textAlign: 'center',
    ...Typography.titleMedium,
  },
  body: {
    color: Colors.text.secondary,
    textAlign: 'center',
    ...Typography.bodySmall,
  },
});

const mapModalStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.sm,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(40,40,44,0.78)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.text.primary,
    ...Typography.titleLarge,
  },
  subtitle: {
    color: Colors.text.secondary,
    fontSize: 12,
  },
  mapWrap: {
    flex: 1,
    marginHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.screenPadding,
    borderRadius: Radius.cardLg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.background.secondary,
  },
  map: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
});
