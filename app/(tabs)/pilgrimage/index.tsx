// Pilgrimage hub. Matches japanwalker.pen Screen 1 (q3N3pG):
// Header (聖地巡禮 + album + search) → Plan your day intro →
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
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { Typography } from '../../../constants/DesignSystem';
import { locationService } from '../../../libs/services/pilgrimage/location-service';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import { rankFeaturedSpotsByPriority } from '../../../libs/services/pilgrimage/featured-spots';
import { Skeleton, ThemedButton, ThemedText, readableTextOn } from '../../../components/themed';
import { Tourism88Rail } from '../../../components/pilgrimage/Tourism88Rail';
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
import { listItemEnter, overlayEnter } from '../../../libs/animations/presets';

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
    // context=pilgrimage tells /search to route picked results to
    // /pilgrimage/[bangumiId] instead of /anime/[id] so the user stays
    // inside the pilgrimage flow.
    router.push({ pathname: '/search', params: { context: 'pilgrimage' } });
  }, [router]);

  const handleOpenAlbum = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/pilgrimage/album');
  }, [router]);

  const handleOpenCamera = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/pilgrimage/capture');
  }, [router]);

  const handleIdentifyScene = useCallback(() => {
    router.push('/pilgrimage/identify');
  }, [router]);

  const handleOpenNews = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/pilgrimage/news');
  }, [router]);

  const handleOpenCharacters = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
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
          <ThemedText
            variant="titleLarge"
            weight="700"
            numberOfLines={1}
            style={styles.headerTitle}>
            {t('tabs.pilgrimageScreen.title')}
          </ThemedText>
          <View style={styles.headerRight}>
            <Pressable
              onPress={handleOpenCharacters}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('tabs.pilgrimageScreen.charactersA11y')}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
              <Ionicons name="people-outline" size={18} color={theme.text.primary} />
            </Pressable>
            <Pressable
              onPress={handleOpenAlbum}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('tabs.pilgrimageScreen.myAlbumA11y')}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
              <Ionicons name="albums-outline" size={18} color={theme.text.primary} />
            </Pressable>
            <Pressable
              onPress={handleOpenCamera}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('pilgrimage.capture.entryA11y')}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
              <Ionicons name="camera-outline" size={18} color={theme.text.primary} />
            </Pressable>
            <Pressable
              onPress={handleSearch}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('tabs.pilgrimageScreen.searchA11y')}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
              <Ionicons name="search" size={18} color={theme.text.primary} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={[styles.introCaps, { color: theme.accent }]}>
              {t('tabs.pilgrimageScreen.intro.caps')}
            </ThemedText>
            <ThemedText variant="bodySmall" style={styles.introBody}>
              {collectionAnimes.length > 0
                ? t('tabs.pilgrimageScreen.intro.body.withCollection')
                : t('tabs.pilgrimageScreen.intro.body.empty')}
            </ThemedText>
          </View>

          <NearbyHero
            theme={theme}
            nearestSpot={nearestSpot}
            nearestSpotAnimeName={
              nearestSpotAnime ? nearestSpotAnime.cn || nearestSpotAnime.title : null
            }
            nearestAnime={nearestAnime}
            nearbyCount={nearbyAnime.length}
            tierLabel={nearby.tierLabel}
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
            Each card's checkmark badge and accent now come from
            resolveHubAnimeProgress / anime.color inside PopularCard.
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
                {sortedCollectionAnimes.map((anime, index) => (
                  <Animated.View
                    key={anime.id}
                    entering={index < 8 ? listItemEnter(index) : undefined}>
                    <PopularCard
                      anime={anime}
                      visited={visited}
                      theme={theme}
                      fromCollection={false}
                      distanceKm={collectionDistanceKm.get(anime.id)}
                      onPress={() => handleAnimePress(anime)}
                    />
                  </Animated.View>
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
                {popularList.map((card, index) => (
                  <Animated.View
                    key={card.anime.id}
                    entering={index < 8 ? listItemEnter(index) : undefined}>
                    <PopularCard
                      anime={card.anime}
                      visited={visited}
                      theme={theme}
                      fromCollection={card.fromCollection}
                      distanceKm={card.distanceKm}
                      onPress={() => handleAnimePress(card.anime)}
                    />
                  </Animated.View>
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

            <ThemedButton
              label={t('pilgrimage.identify.entry')}
              accessibilityLabel={t('pilgrimage.identify.entryA11y')}
              onPress={handleIdentifyScene}
              icon={<Ionicons name="scan-outline" size={18} color={readableTextOn(theme.accent)} />}
              shape="rounded"
              fullWidth
            />

            <ThemedButton
              label={t('news.hubEntry')}
              accessibilityLabel={t('news.hubEntryA11y')}
              onPress={handleOpenNews}
              icon={
                <Ionicons name="newspaper-outline" size={18} color={readableTextOn(theme.accent)} />
              }
              shape="rounded"
              fullWidth
            />

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
                    <Animated.View
                      key={`${anime.id}:${spot.id}`}
                      entering={index < 8 ? listItemEnter(index) : undefined}>
                      <FeaturedSpotRow
                        spot={spot}
                        anime={anime}
                        distanceKm={distanceKm}
                        fromCollection={fromCollection}
                        theme={theme}
                        onPress={() => handleAnimePress(anime)}
                      />
                    </Animated.View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <AnitabiAttributionFooter bangumiId={null} variant="footer" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function NearbyHero({
  theme,
  nearestSpot,
  nearestSpotAnimeName,
  nearestAnime,
  nearbyCount,
  tierLabel,
  hasLocation,
  onPress,
}: {
  theme: ThemePalette;
  nearestSpot: NearbySpotHit | null;
  nearestSpotAnimeName: string | null;
  nearestAnime: AnimeCard | null;
  nearbyCount: number;
  tierLabel: string | null;
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
        <SpotImage uri={spotImageUri} style={styles.heroCoverArt} contentFit="cover" />
      ) : (
        <View style={[styles.heroCoverArt, { backgroundColor: theme.background.tertiary }]} />
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)']}
        style={styles.heroOverlay}
        pointerEvents="none"
      />
      <View style={styles.heroBody}>
        <View style={styles.heroLabelRow}>
          <View style={[styles.heroPinBadge, { backgroundColor: theme.background.tertiary }]}>
            <Ionicons name="location" size={11} color={theme.text.primary} />
          </View>
          <ThemedText variant="bodySmall" weight="700">
            {t('tabs.pilgrimageScreen.hero.nearestSpotCaps')}
          </ThemedText>
        </View>
        <ThemedText variant="captionSmall" tone="secondary" style={{ marginTop: 4 }}>
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
    <Animated.View entering={overlayEnter()} style={styles.sectionHeader}>
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
    </Animated.View>
  );
}

function PopularCard({
  anime,
  visited,
  theme,
  fromCollection,
  distanceKm,
  onPress,
}: {
  anime: AnitabiBangumi;
  visited: VisitedMap;
  theme: ThemePalette;
  fromCollection: boolean;
  distanceKm?: number;
  onPress: () => void;
}) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const total = anime.pointsLength ?? 0;
  // Per-anime accent (map.tsx:491 precedent): `color` can be an empty string
  // from Anitabi, so `||` falls back to the theme accent honestly instead of
  // rendering a blank/transparent badge.
  const accent = anime.color || theme.accent;
  const accentFg = readableTextOn(accent);
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
        <View style={[styles.popularBadge, { backgroundColor: `${accent}E6` }]}>
          <ThemedText variant="captionSmall" weight="700" style={{ color: accentFg }}>
            {t('pilgrimageUi.spotsCount', { count: total })}
          </ThemedText>
        </View>
        {fromCollection ? (
          <View style={[styles.collectionBadge, { backgroundColor: `${theme.status.info}D9` }]}>
            <Ionicons name="bookmark" size={9} color={readableTextOn(theme.status.info)} />
          </View>
        ) : null}
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
          style={styles.compactCaption}>
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
  onPress,
}: {
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  distanceKm?: number;
  fromCollection: boolean;
  theme: ThemePalette;
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
      style={({ pressed }) => [styles.spotRow, pressed && { opacity: 0.92 }]}>
      <SpotImage uri={spot.image} style={styles.spotThumb} contentFit="cover" />
      <View style={styles.spotBody}>
        <View style={styles.spotTitleRow}>
          <ThemedText variant="bodySmall" weight="700" numberOfLines={1} style={{ flex: 1 }}>
            {spotTitles.primary}
          </ThemedText>
          {fromCollection ? (
            <View
              style={[
                styles.collectionPill,
                {
                  backgroundColor: `${theme.status.info}1A`,
                  borderColor: `${theme.status.info}66`,
                },
              ]}>
              <Ionicons name="bookmark" size={9} color={theme.status.info} />
            </View>
          ) : null}
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
    // flexShrink + single line so the 4-button header cluster can't push the
    // title into unclipped overflow on narrow screens (album.tsx precedent).
    headerTitle: { ...Typography.headlineMedium, flexShrink: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    scrollContent: { paddingHorizontal: 20, paddingTop: 20, gap: 22 },
    intro: { gap: 4 },
    introCaps: { ...Typography.captionSmall, letterSpacing: 1.2 },
    compactCaption: Typography.captionSmall,
    introBody: { lineHeight: 18 },
    heroCard: {
      height: 170,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    heroCoverArt: {
      ...StyleSheet.absoluteFill,
    },
    heroOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 78,
    },
    heroBody: { position: 'absolute', left: 16, right: 16, bottom: 14 },
    heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroPinBadge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
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
    popularPoster: { width: '100%', height: '100%' },
    popularBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
    },
    collectionBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
      borderWidth: 1,
      borderColor: `${theme.status.success}66`,
    },
    popularMeta: { padding: 8, paddingHorizontal: 10, gap: 2 },
    spotList: { gap: 10 },
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
    spotBody: { flex: 1, gap: 3 },
    spotTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    collectionPill: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    spotMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    spotDistRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  });
}
