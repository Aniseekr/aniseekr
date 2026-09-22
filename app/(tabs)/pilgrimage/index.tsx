// Pilgrimage hub. Matches japanwalker.pen Screen 1 (q3N3pG):
// Header (聖地巡禮 + tools) → search → collection-aware intro →
// hero (nearest spot) → 我的巡禮 (the user's collection) → 附近 (nearby/
// popular rail) → 探索 (Tourism 88 + cross-anime Featured Spots list).
//
// The hub is list-only. Map view lives on the See All screen
// (app/(tabs)/pilgrimage/map.tsx) so users land on a navigable card list
// first and tap into the map deliberately — see Issue: "see all 應該優先是
// list 才讓人點進 map".
//
// Data priority (matches "collection 優先, 不夠再補 featured" requirement):
//   1. The user's collection (user_anime + favorites) joined to Anitabi via
//      collectionPilgrimageService — these are the anime the user actually
//      cares about and should anchor every rail/list.
//   2. FEATURED_PILGRIMAGE_ANIME backfills until the rails feel populated.
//
// Featured Spots rank real distance first. Planned landmarks and collection
// entries get bounded boosts so intent matters without burying nearby spots.

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { Radius, Size, Spacing, Typography } from '../../../constants/DesignSystem';
import { locationService } from '../../../libs/services/pilgrimage/location-service';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import { rankFeaturedSpotsByPriority } from '../../../libs/services/pilgrimage/featured-spots';
import { Skeleton, ThemedIconButton, ThemedText } from '../../../components/themed';
import { Tourism88Rail } from '../../../components/pilgrimage/Tourism88Rail';
import { PilgrimageToolsMenu } from '../../../components/pilgrimage/PilgrimageToolsMenu';
import { AnitabiAttributionFooter } from '../../../components/pilgrimage/common/AnitabiAttributionFooter';
import { getUnique88AnimeByPopularity } from '../../../libs/services/pilgrimage/anime88-repository';
import { bangumiSubjectImageUrl } from '../../../libs/clients/bangumi-client';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeTitles,
  getPilgrimageSpotTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import type { AnitabiBangumi, AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import {
  DEFAULT_PILGRIMAGE_SORT_KEY,
  resolveEffectivePilgrimageSortKey,
  resolvePilgrimageSortKeys,
  sortPilgrimageAnimes,
  type PilgrimageSortKey,
} from '../../../libs/services/pilgrimage/pilgrimage-collection-sort';
import { PilgrimageSortPill } from '../../../components/pilgrimage/PilgrimageSortPill';
import { SpotImage } from '../../../components/pilgrimage/SpotImage';
import { getIndexedById } from '../../../libs/services/pilgrimage/anitabi-index';
import { normalizeAnitabiImageUrl } from '../../../libs/services/pilgrimage/anitabi-image';
import type { NearbySpotHit } from '../../../libs/services/pilgrimage/spot-index';
import { useT } from '../../../libs/i18n';
import { usePilgrimageHubScreenData } from '../../../hooks/usePilgrimageHubScreenData';
import { resolveHubAnimeProgress } from '../../../libs/services/pilgrimage/pilgrimage-hub-progress';
import { CacheService } from '../../../libs/services/cache-service';
import { DETAIL_CACHE_KEY_PREFIX } from '../../../libs/services/pilgrimage/anitabi-service';
import { useExperienceMode } from '../../../hooks/useExperienceMode';
import { resolveExperienceTabTarget } from '../../../libs/navigation/experience-tabs';

interface FeaturedSpot {
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  distanceKm?: number;
  fromCollection: boolean;
  planned: boolean;
}

interface AnimeCard {
  anime: AnitabiBangumi;
  fromCollection: boolean;
  distanceKm?: number;
}

// Tiered radii — most users are not standing in Japan, so a hard 50km cap
// makes the "nearby" hero permanently empty. We fan out and label each tier
// honestly instead of pretending everything is "near".
// `labelKey` resolves at render via t() so the hero respects the user's app
// language.
const NEARBY_TIERS_KM: readonly { km: number; labelKey: string }[] = [
  { km: 30, labelKey: 'tabs.pilgrimageScreen.tier.walking' },
  { km: 100, labelKey: 'tabs.pilgrimageScreen.tier.dayTrip' },
  { km: 500, labelKey: 'tabs.pilgrimageScreen.tier.inRegion' },
  { km: 5000, labelKey: 'tabs.pilgrimageScreen.tier.farAway' },
];
const FEATURED_SPOT_LIMIT = 6;
const POPULAR_LIMIT = 14;
const COLLECTION_BACKFILL_TARGET = 16;

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
  const t = useT();
  const { mode, visibleTabs } = useExperienceMode();
  const searchTarget = resolveExperienceTabTarget(visibleTabs, 'explorerSearch', '/search');
  const journalTarget = resolveExperienceTabTarget(
    visibleTabs,
    'explorerJournal',
    '/pilgrimage/album'
  );
  const cameraTarget = resolveExperienceTabTarget(
    visibleTabs,
    'explorerCamera',
    '/pilgrimage/capture'
  );
  const {
    collectionAnimes,
    featuredAnimes,
    loading,
    error,
    visited,
    spotIntents,
    userLocation,
    nearestSpot,
  } = usePilgrimageHubScreenData();
  const [sortKey, setSortKey] = useState<PilgrimageSortKey>(DEFAULT_PILGRIMAGE_SORT_KEY);
  const [toolsMenuVisible, setToolsMenuVisible] = useState(false);

  // Merge: collection first, then backfill from featured (deduped by id).
  const animeCards = useMemo<AnimeCard[]>(() => {
    const seen = new Set<number>();
    const out: AnimeCard[] = [];
    for (const anime of collectionAnimes) {
      if (seen.has(anime.id)) continue;
      seen.add(anime.id);
      out.push({ anime, fromCollection: true });
    }
    if (out.length < COLLECTION_BACKFILL_TARGET) {
      for (const anime of featuredAnimes) {
        if (seen.has(anime.id)) continue;
        seen.add(anime.id);
        out.push({ anime, fromCollection: false });
        if (out.length >= COLLECTION_BACKFILL_TARGET) break;
      }
    }
    if (userLocation) {
      for (const card of out) {
        if (!isValidGeo(card.anime.geo)) continue;
        const d = locationService.getDistanceKm(userLocation, {
          latitude: card.anime.geo[0],
          longitude: card.anime.geo[1],
        });
        if (Number.isFinite(d)) card.distanceKm = d;
      }
    }
    return out;
  }, [collectionAnimes, featuredAnimes, userLocation]);

  // ─── My Collection rail (sortable, collection-only) ─────────────────────
  // The user's own anime get a first-class rail above the discovery rails so
  // they aren't buried among featured/88 cards. Distance is computed from the
  // real fix only (Rule 8) — undefined per-anime when there's no location.
  const hasLocation = !!userLocation;
  const availableSortKeys = useMemo(() => resolvePilgrimageSortKeys(hasLocation), [hasLocation]);
  const effectiveSortKey = resolveEffectivePilgrimageSortKey(sortKey, hasLocation);

  const collectionDistanceKm = useMemo(() => {
    const m = new Map<number, number>();
    if (!userLocation) return m;
    for (const anime of collectionAnimes) {
      if (!isValidGeo(anime.geo)) continue;
      const d = locationService.getDistanceKm(userLocation, {
        latitude: anime.geo[0],
        longitude: anime.geo[1],
      });
      if (Number.isFinite(d)) m.set(anime.id, d);
    }
    return m;
  }, [collectionAnimes, userLocation]);

  const sortedCollectionAnimes = useMemo(
    () =>
      sortPilgrimageAnimes(collectionAnimes, effectiveSortKey, {
        distanceKmOf: (a) => collectionDistanceKm.get(a.id),
        getTitle: (a) => getPilgrimageAnimeTitles(a).primary,
      }),
    [collectionAnimes, effectiveSortKey, collectionDistanceKm]
  );

  const allSpots = useMemo<FeaturedSpot[]>(() => {
    const list: FeaturedSpot[] = [];
    for (const card of animeCards) {
      const points = card.anime.litePoints ?? [];
      for (const spot of points) {
        if (!isValidGeo(spot.geo)) continue;
        let distanceKm: number | undefined;
        if (userLocation) {
          const d = locationService.getDistanceKm(userLocation, {
            latitude: spot.geo[0],
            longitude: spot.geo[1],
          });
          if (Number.isFinite(d)) distanceKm = d;
        }
        list.push({
          spot,
          anime: card.anime,
          distanceKm,
          fromCollection: card.fromCollection,
          planned: spotIntents[spot.id]?.planned === true,
        });
      }
    }
    return list;
  }, [animeCards, userLocation, spotIntents]);

  // Walk through tiers until we find a non-empty one, so users outside Japan
  // still see something meaningful (even if it just says "far away" with the
  // closest hub).
  const nearby = useMemo<{ tierLabel: string | null; list: AnimeCard[] }>(() => {
    if (!userLocation) return { tierLabel: null, list: [] };
    const sorted = animeCards
      .filter((c) => c.distanceKm !== undefined)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    if (sorted.length === 0) return { tierLabel: null, list: [] };
    for (const tier of NEARBY_TIERS_KM) {
      const within = sorted.filter((c) => (c.distanceKm ?? Infinity) <= tier.km);
      if (within.length > 0) return { tierLabel: t(tier.labelKey), list: within };
    }
    return { tierLabel: t('tabs.pilgrimageScreen.tier.farAway'), list: sorted.slice(0, 5) };
  }, [animeCards, userLocation, t]);

  const nearbyAnime = nearby.list;
  const nearestAnime = nearbyAnime[0] ?? null;

  // `nearestSpot` (nearest single point-level spot for the hero card, spec
  // 2.4) comes from usePilgrimageHubScreenData — it's derived from
  // `userLocation`, which the hook already owns.
  const nearestSpotAnime = nearestSpot ? getIndexedById(nearestSpot.bangumiId) : null;

  const featuredSpots = useMemo<FeaturedSpot[]>(() => {
    return rankFeaturedSpotsByPriority(allSpots).slice(0, FEATURED_SPOT_LIMIT);
  }, [allSpots]);

  const handleAnimePress = useCallback(
    (anime: AnitabiBangumi) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(
        buildPilgrimageDetailRoute(anime.id, {
          returnTo: 'hub',
          title: anime.title || anime.cn,
          titleSecondary: anime.cn && anime.cn !== anime.title ? anime.cn : null,
          poster: anime.cover,
          themeColor: anime.color,
        })
      );
    },
    [router]
  );

  const handleSearch = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    if (searchTarget.isVisibleTab) {
      router.navigate(searchTarget.href);
      return;
    }
    // context=pilgrimage tells /search to route picked results to
    // /pilgrimage/[bangumiId] instead of /anime/[id] so the user stays
    // inside the pilgrimage flow.
    router.push({ pathname: '/search', params: { context: 'pilgrimage' } });
  }, [router, searchTarget.href, searchTarget.isVisibleTab]);

  const handleOpenAlbum = useCallback(() => {
    if (journalTarget.isVisibleTab) {
      router.navigate(journalTarget.href);
      return;
    }
    router.push(journalTarget.href);
  }, [journalTarget.href, journalTarget.isVisibleTab, router]);

  const handleOpenCamera = useCallback(() => {
    if (cameraTarget.isVisibleTab) {
      router.navigate(cameraTarget.href);
      return;
    }
    router.push(cameraTarget.href);
  }, [cameraTarget.href, cameraTarget.isVisibleTab, router]);

  const handleIdentifyScene = useCallback(() => {
    router.push('/pilgrimage/identify');
  }, [router]);

  const handleOpenNews = useCallback(() => {
    router.push('/pilgrimage/news');
  }, [router]);

  const handleOpenCharacters = useCallback(() => {
    router.push('/companion/library');
  }, [router]);

  // "See all" next to the Popular Animes rail keeps the user's list-scanning
  // intent even though the See All route is now map-first by default.
  const handleSeeAllAnimes = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push({ pathname: '/pilgrimage/map', params: { mode: 'list' } });
  }, [router]);

  // My Collection "See all" lands directly on the See-all list pre-filtered to
  // the collection (map.tsx reads the `filter` param to seed its hub filter).
  const handleSeeAllCollection = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push({ pathname: '/pilgrimage/map', params: { mode: 'list', filter: 'collection' } });
  }, [router]);

  // True fullscreen has to leave the Tabs container — pushing to a sibling
  // route registered with `tabBarStyle: { display: 'none' }` is the only way
  // to actually hide the bottom dock. Back from there returns to the hub.
  // The hero card is the sole map entry point on the hub now; it opens the
  // See All screen directly in map mode and centres on the nearest anime.
  const handleHeroPress = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    const focus = nearestSpot?.bangumiId ?? nearestAnime?.anime.id ?? null;
    router.push({
      pathname: '/pilgrimage/map',
      params: {
        mode: 'map',
        ...(focus ? { focus: String(focus) } : {}),
      },
    });
  }, [nearestSpot, nearestAnime, router]);

  // Popular rail is pure discovery: collection now has its own rail above, so
  // exclude collected anime here to avoid showing them twice. When the
  // collection is empty, animeCards carries no `fromCollection` entries, so
  // this is the previous featured-only behaviour unchanged.
  const popularList = useMemo(
    () => animeCards.filter((card) => !card.fromCollection).slice(0, POPULAR_LIMIT),
    [animeCards]
  );

  // Anime Tourism 88 rail. Sorted once at module import. Covers come from the
  // Bangumi poster CDN keyed by bangumiId (bangumiSubjectImageUrl) — anitabi's
  // CDN 403s non-browser clients, so the anitabi-index cover is unusable here.
  const tourism88Entries = useMemo(() => getUnique88AnimeByPopularity(), []);
  const collectionBangumiIds = useMemo(
    () => new Set(collectionAnimes.map((a) => a.id)),
    [collectionAnimes]
  );
  const handle88EntryPress = useCallback(
    (entry: (typeof tourism88Entries)[number]) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(
        buildPilgrimageDetailRoute(entry.bangumiId, {
          returnTo: 'hub',
          title: entry.titleJa || entry.titleEn,
          titleSecondary: entry.titleEn && entry.titleEn !== entry.titleJa ? entry.titleEn : null,
          poster: bangumiSubjectImageUrl(entry.bangumiId),
        })
      );
    },
    [router]
  );
  const handleSee88All = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push({ pathname: '/pilgrimage/map', params: { mode: 'map' } });
  }, [router]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.headerBar}>
          <View style={styles.headerIdentity}>
            <ThemedText
              variant={mode === 'explorer' ? 'headlineMedium' : 'titleLarge'}
              weight="700"
              numberOfLines={1}
              style={styles.headerTitle}>
              {mode === 'explorer'
                ? t('tabs.pilgrimageScreen.explorerTitle')
                : t('tabs.pilgrimageScreen.title')}
            </ThemedText>
            {mode === 'explorer' ? (
              <ThemedText variant="bodySmall" tone="secondary" numberOfLines={2}>
                {t('tabs.pilgrimageScreen.explorerSubtitle')}
              </ThemedText>
            ) : null}
          </View>
          <ThemedIconButton
            onPress={() => setToolsMenuVisible(true)}
            accessibilityLabel={t('tabs.pilgrimageScreen.moreActions')}
            variant="ghost"
            icon={() => <Ionicons name="compass-outline" size={22} color={theme.accent} />}
          />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={handleSearch}
            accessibilityRole="button"
            accessibilityLabel={t('tabs.pilgrimageScreen.searchA11y')}
            style={({ pressed }) => [styles.searchBar, pressed && styles.searchBarPressed]}>
            <Ionicons name="search" size={20} color={theme.text.secondary} />
            <ThemedText variant="bodySmall" tone="secondary">
              {t('common.search')}
            </ThemedText>
          </Pressable>

          <ThemedText variant="bodySmall" tone="secondary" style={styles.introBody}>
            {collectionAnimes.length > 0
              ? t('tabs.pilgrimageScreen.intro.body.withCollection')
              : t('tabs.pilgrimageScreen.intro.body.empty')}
          </ThemedText>

          <NearbyHero
            theme={theme}
            nearestSpot={nearestSpot}
            nearestSpotAnimeName={
              nearestSpotAnime ? nearestSpotAnime.cn || nearestSpotAnime.title : null
            }
            nearestAnime={nearestAnime}
            hasLocation={!!userLocation}
            onPress={handleHeroPress}
          />

          {/*
            Only show the placeholder rail when we genuinely have nothing.
            With the offline-index seed, `animeCards` is populated on frame 1
            for the featured set, so the skeleton only appears for users with
            an empty collection AND an offline index that didn't cover any of
            the featured anime — vanishingly rare.
          */}
          {loading && animeCards.length === 0 ? (
            <Skeleton.AnimeCardList count={6} paddingHorizontal={0} />
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={20} color={theme.status.warning} />
              <ThemedText variant="bodySmall" tone="secondary" align="center">
                {error}
              </ThemedText>
            </View>
          ) : null}

          {/*
            "我的巡禮" — the user's own collection, promoted to the second
            slot (right after the nearest-spot hero) so their own progress
            anchors the hub instead of being buried under discovery rails.
            Each card's compact progress indicator comes from
            resolveHubAnimeProgress inside PopularCard.
          */}
          {sortedCollectionAnimes.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title={t('tabs.pilgrimageScreen.section.myPilgrimage')}
                count={sortedCollectionAnimes.length}
                cta={t('tabs.pilgrimageScreen.section.seeAll')}
                onCta={handleSeeAllCollection}
                theme={theme}
                accessory={
                  <PilgrimageSortPill
                    sortKey={effectiveSortKey}
                    availableKeys={availableSortKeys}
                    theme={theme}
                    onSelect={setSortKey}
                  />
                }
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.popularRow}>
                {sortedCollectionAnimes.map((anime) => (
                  <PopularCard
                    key={anime.id}
                    anime={anime}
                    visited={visited}
                    theme={theme}
                    distanceKm={collectionDistanceKm.get(anime.id)}
                    onPress={() => handleAnimePress(anime)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {popularList.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title={t('tabs.pilgrimageScreen.section.popularAnimes')}
                cta={t('tabs.pilgrimageScreen.section.seeAll')}
                onCta={handleSeeAllAnimes}
                theme={theme}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.popularRow}>
                {popularList.map((card) => (
                  <PopularCard
                    key={card.anime.id}
                    anime={card.anime}
                    visited={visited}
                    theme={theme}
                    distanceKm={card.distanceKm}
                    onPress={() => handleAnimePress(card.anime)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/*
            探索 — everything that isn't the user's own collection or the
            nearby rail lands here, demoted below the personal sections:
            the Tourism 88 official list and the cross-anime featured-spots
            list (ranked by real distance, see rankFeaturedSpotsByPriority).
          */}
          <View style={styles.section}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={[styles.introCaps, { color: theme.accent }]}>
              {t('tabs.pilgrimageScreen.section.explore')}
            </ThemedText>

            {tourism88Entries.length > 0 ? (
              <Tourism88Rail
                entries={tourism88Entries}
                collectionBangumiIds={collectionBangumiIds}
                onPressEntry={handle88EntryPress}
                onSeeAll={handleSee88All}
              />
            ) : null}

            {featuredSpots.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  title={t('tabs.pilgrimageScreen.section.featuredSpots')}
                  cta={t('tabs.pilgrimageScreen.section.viewMap')}
                  onCta={handleHeroPress}
                  theme={theme}
                />
                <View style={styles.spotList}>
                  {featuredSpots.map(({ spot, anime, distanceKm, fromCollection }, index) => (
                    <FeaturedSpotRow
                      key={`${anime.id}:${spot.id}`}
                      spot={spot}
                      anime={anime}
                      distanceKm={distanceKm}
                      fromCollection={fromCollection}
                      theme={theme}
                      showDivider={index < featuredSpots.length - 1}
                      onPress={() => handleAnimePress(anime)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <AnitabiAttributionFooter bangumiId={null} variant="footer" />
        </ScrollView>
      </SafeAreaView>
      <PilgrimageToolsMenu
        visible={toolsMenuVisible}
        onClose={() => setToolsMenuVisible(false)}
        onOpenCharacters={handleOpenCharacters}
        onOpenAlbum={handleOpenAlbum}
        onOpenCamera={handleOpenCamera}
        onIdentifyScene={handleIdentifyScene}
        onOpenNews={handleOpenNews}
      />
    </View>
  );
}

function NearbyHero({
  theme,
  nearestSpot,
  nearestSpotAnimeName,
  nearestAnime,
  hasLocation,
  onPress,
}: {
  theme: ThemePalette;
  nearestSpot: NearbySpotHit | null;
  nearestSpotAnimeName: string | null;
  nearestAnime: AnimeCard | null;
  hasLocation: boolean;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = useT();
  const nearestTitles = nearestAnime ? getPilgrimageAnimeTitles(nearestAnime.anime) : null;
  // Anitabi CDN serves scene images only at h160/h360/full — h720 404s. The
  // hub hero renders larger than the h160 thumbnail default, so upgrade it
  // one step (mirrors the same replace in (rate)/index.tsx's trending card).
  const spotImageUri = nearestSpot
    ? normalizeAnitabiImageUrl(nearestSpot.image, nearestSpot.bangumiId).replace(
        '?plan=h160',
        '?plan=h360'
      )
    : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('tabs.pilgrimageScreen.hero.labelAccessibility')}
      style={({ pressed }) => [styles.heroCard, pressed && { opacity: 0.92 }]}>
      {spotImageUri ? (
        <SpotImage uri={spotImageUri} style={styles.heroThumb} contentFit="cover" />
      ) : (
        <View style={styles.heroPlaceholder}>
          <Ionicons name="map-outline" size={24} color={theme.text.tertiary} />
        </View>
      )}
      <View style={styles.heroBody}>
        <View style={styles.heroLabelRow}>
          <Ionicons name="location" size={13} color={theme.accent} />
          <ThemedText variant="captionSmall" weight="700" style={{ color: theme.accent }}>
            {t('tabs.pilgrimageScreen.hero.nearestSpotCaps')}
          </ThemedText>
        </View>
        <ThemedText variant="bodySmall" weight="700" numberOfLines={2}>
          {hasLocation
            ? nearestSpot
              ? t('tabs.pilgrimageScreen.hero.closestWithDistance', {
                  title: nearestSpot.cn || nearestSpot.name,
                  distance: formatKm(nearestSpot.distanceKm),
                })
              : nearestAnime
                ? t('tabs.pilgrimageScreen.hero.closest', { title: nearestTitles?.primary ?? '—' })
                : t('tabs.pilgrimageScreen.hero.noMappedAnime')
            : t('tabs.pilgrimageScreen.hero.withoutLocation')}
        </ThemedText>
        {hasLocation && nearestSpot && nearestSpotAnimeName ? (
          <ThemedText
            variant="captionSmall"
            tone="tertiary"
            style={{ marginTop: 2 }}
            numberOfLines={1}>
            {nearestSpotAnimeName}
          </ThemedText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
    </Pressable>
  );
}

function SectionHeader({
  title,
  count,
  cta,
  onCta,
  accessory,
  theme,
}: {
  title: string;
  count?: number;
  cta?: string;
  onCta?: () => void;
  accessory?: ReactNode;
  theme: ThemePalette;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <ThemedText variant="titleMedium" weight="700">
          {title}
        </ThemedText>
        {count !== undefined ? (
          <ThemedText variant="bodySmall" weight="600" tone="tertiary">
            {count}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.sectionHeaderRight}>
        {accessory}
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
    </View>
  );
}

function PopularCard({
  anime,
  visited,
  theme,
  distanceKm,
  onPress,
}: {
  anime: AnitabiBangumi;
  visited: VisitedMap;
  theme: ThemePalette;
  distanceKm?: number;
  onPress: () => void;
}) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const total = anime.pointsLength ?? 0;
  // Honest progress (Rule 8): visitedCount ∩ points, with the denominator
  // only when we hold this anime's full per-anime points list — populated by
  // opening the detail screen. The retired points-top release no longer seeds
  // this cache; getSync remains a cheap frame-1 read (Rule 10). Absent →
  // "✓{count}" alone.
  const fullPoints = CacheService.getSync<AnitabiPoint[]>(DETAIL_CACHE_KEY_PREFIX + anime.id);
  const progress = resolveHubAnimeProgress(anime, visited, fullPoints);
  const titles = getPilgrimageAnimeTitles(anime);
  const subtitle = formatPilgrimageSubtitle(titles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimageUi.animePilgrimageA11y', { title: titles.primary })}
      style={({ pressed }) => [styles.popularCard, pressed && { opacity: 0.9 }]}>
      <View style={styles.popularPosterWrap}>
        <SpotImage uri={anime.cover} style={styles.popularPoster} contentFit="cover" />
        {progress.visitedCount > 0 ? (
          <View style={styles.popularVisited}>
            <Ionicons name="checkmark" size={10} color={theme.status.success} />
            <ThemedText variant="captionSmall" weight="700" style={{ color: theme.status.success }}>
              {progress.total != null
                ? t('pilgrimageUi.progressFraction', {
                    visited: progress.visitedCount,
                    total: progress.total,
                  })
                : progress.visitedCount}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.popularMeta}>
        <ThemedText variant="captionSmall" weight="700" numberOfLines={1}>
          {titles.primary}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            variant="captionSmall"
            tone="secondary"
            numberOfLines={1}
            style={styles.compactCaption}>
            {subtitle}
          </ThemedText>
        ) : null}
        <ThemedText
          variant="captionSmall"
          tone="tertiary"
          numberOfLines={1}
          style={styles.popularDetails}>
          {t('pilgrimageUi.spotsCount', { count: total })}
          {' · '}
          {distanceKm !== undefined
            ? `${formatKm(distanceKm)} · ${anime.city || '—'}`
            : anime.city || '—'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function FeaturedSpotRow({
  spot,
  anime,
  distanceKm,
  fromCollection,
  theme,
  showDivider,
  onPress,
}: {
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  distanceKm?: number;
  fromCollection: boolean;
  theme: ThemePalette;
  showDivider: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const spotTitles = getPilgrimageSpotTitles(spot);
  const animeTitles = getPilgrimageAnimeTitles(anime);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimageUi.spotFromAnimeA11y', {
        spot: spotTitles.primary,
        anime: animeTitles.primary,
      })}
      style={({ pressed }) => [
        styles.spotRow,
        showDivider && styles.spotRowDivider,
        pressed && styles.spotRowPressed,
      ]}>
      <SpotImage uri={spot.image} style={styles.spotThumb} contentFit="cover" />
      <View style={styles.spotBody}>
        <View style={styles.spotTitleRow}>
          <ThemedText variant="bodySmall" weight="700" numberOfLines={1} style={{ flex: 1 }}>
            {spotTitles.primary}
          </ThemedText>
          {fromCollection ? <Ionicons name="bookmark" size={16} color={theme.status.info} /> : null}
        </View>
        <View style={styles.spotMetaRow}>
          <Ionicons name="film-outline" size={10} color={theme.text.tertiary} />
          <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
            {animeTitles.primary}
            {anime.city ? ` · ${anime.city}` : ''}
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
    headerIdentity: { flex: 1, gap: Spacing.xxs },
    headerTitle: { ...Typography.headlineMedium, flexShrink: 1 },
    searchBar: {
      minHeight: Size.recommendedTouchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    searchBarPressed: { opacity: 0.78 },
    scrollContent: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.sm,
      gap: Spacing.lg,
    },
    introCaps: { ...Typography.captionSmall, letterSpacing: 1.2 },
    compactCaption: Typography.captionSmall,
    introBody: { lineHeight: 18, paddingHorizontal: Spacing.xxs },
    heroCard: {
      minHeight: 112,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: 10,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
    },
    heroThumb: {
      width: 92,
      height: 92,
      borderRadius: 10,
      backgroundColor: theme.background.tertiary,
    },
    heroPlaceholder: {
      width: 92,
      height: 92,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.tertiary,
    },
    heroBody: { flex: 1, gap: 4 },
    heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
    section: { gap: 12 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    sectionHeaderLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
    sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sectionCta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    popularRow: { gap: 12, paddingRight: 4 },
    popularCard: {
      width: 128,
    },
    popularPosterWrap: {
      height: 148,
      width: '100%',
      overflow: 'hidden',
      borderRadius: Radius.lg,
      backgroundColor: theme.background.tertiary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
    },
    popularPoster: { width: '100%', height: '100%' },
    popularVisited: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    popularMeta: { paddingTop: 8, paddingHorizontal: 2, gap: 2 },
    popularDetails: { ...Typography.captionSmall, fontVariant: ['tabular-nums'] },
    spotList: {
      overflow: 'hidden',
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
    },
    spotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
    },
    spotRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
    },
    spotRowPressed: { backgroundColor: theme.background.tertiary },
    spotThumb: {
      width: 64,
      height: 64,
      borderRadius: 10,
      backgroundColor: theme.background.tertiary,
    },
    spotBody: { flex: 1, gap: 3 },
    spotTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    spotMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    spotDistRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  });
}
