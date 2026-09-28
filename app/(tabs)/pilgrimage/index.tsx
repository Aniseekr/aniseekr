import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ThemedButton,
  ThemedIconButton,
  ThemedSurface,
  ThemedText,
  Skeleton,
} from '../../../components/themed';
import { SpotImage } from '../../../components/pilgrimage/SpotImage';
import { AnitabiAttributionFooter } from '../../../components/pilgrimage/common/AnitabiAttributionFooter';
import { ExplorerMapView } from '../../../components/pilgrimage/home/ExplorerMapView';
import {
  usePilgrimageHubScreenData,
  type UsePilgrimageHubScreenData,
} from '../../../hooks/usePilgrimageHubScreenData';
import { useExperienceMode } from '../../../hooks/useExperienceMode';
import { useTheme } from '../../../context/ThemeContext';
import { bottomPad, Radius, Size, Spacing, TabBar } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { normalizeAnitabiImageUrl } from '../../../libs/services/pilgrimage/anitabi-image';
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import { buildMapsURL } from '../../../components/pilgrimage/detail';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import { CollectionPoster } from '../../../components/pilgrimage/home/ExplorerHomeRows';
import { ExplorerDiscoverSection } from '../../../components/pilgrimage/home/ExplorerDiscoverSection';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

const RAIL_LIMIT = 8;

export default function PilgrimageHome() {
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<'list' | 'map'>(params.view === 'map' ? 'map' : 'list');
  const data = usePilgrimageHubScreenData();
  useEffect(() => setView(params.view === 'map' ? 'map' : 'list'), [params.view]);
  if (view === 'map') return <ExplorerMapView onShowList={() => setView('list')} />;
  return <ExplorerHomeList data={data} onShowMap={() => setView('map')} />;
}

function ExplorerHomeList({
  data,
  onShowMap,
}: {
  data: UsePilgrimageHubScreenData;
  onShowMap: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();
  const { visibleTabs } = useExperienceMode();
  const nearest = data.nearestSpot;
  const nearestAnime = nearest
    ? (data.collectionAnimes.find((anime) => anime.id === nearest.bangumiId) ??
      data.featuredAnimes.find((anime) => anime.id === nearest.bangumiId))
    : null;
  const nearestTitle =
    nearestAnime?.title || nearestAnime?.cn ? getPilgrimageAnimeTitles(nearestAnime).primary : null;
  const nearestPoster = nearestAnime?.cover ?? null;
  const nearEmpty =
    data.locationStatus === 'granted' &&
    !data.nearbyPending &&
    !data.nearbyError &&
    data.nearbyCoverage === 'known' &&
    !nearest;
  const bottom = bottomPad(insets) + TabBar.height;

  const openAnime = (anime: AnitabiBangumi) => {
    router.push(
      buildPilgrimageDetailRoute(anime.id, {
        returnTo: 'hub',
        title: getPilgrimageAnimeTitles(anime).primary,
        poster: anime.cover,
      })
    );
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
        <View style={styles.titleRow}>
          <ThemedText variant="headlineLarge" weight="700" style={styles.flex}>
            {t('tabs.pilgrimage')}
          </ThemedText>
          <ThemedIconButton
            accessibilityLabel={t('tabs.pilgrimageHome.showMap')}
            icon={(color) => <Ionicons name="map" size={22} color={color} />}
            onPress={onShowMap}
          />
        </View>
        <Pressable
          accessibilityRole="search"
          accessibilityLabel={t('tabs.pilgrimageHome.search')}
          onPress={() => router.push({ pathname: '/search', params: { context: 'pilgrimage' } })}
          style={[styles.search, { backgroundColor: theme.background.secondary }]}>
          <Ionicons name="search" size={20} color={theme.text.tertiary} />
          <ThemedText variant="bodyMedium" tone="tertiary">
            {t('tabs.pilgrimageHome.search')}
          </ThemedText>
        </Pressable>
        {!visibleTabs.includes('explorerCamera') || !visibleTabs.includes('explorerJournal') ? (
          <View style={styles.shortcuts}>
            {!visibleTabs.includes('explorerCamera') ? (
              <ThemedButton
                size="sm"
                variant="secondary"
                label={t('tabs.explorerCamera')}
                onPress={() => router.push('/pilgrimage/capture')}
              />
            ) : null}
            {!visibleTabs.includes('explorerJournal') ? (
              <ThemedButton
                size="sm"
                variant="secondary"
                label={t('tabs.explorerJournal')}
                onPress={() => router.push('/pilgrimage/album')}
              />
            ) : null}
          </View>
        ) : null}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText variant="titleLarge" weight="700">
              {t('tabs.pilgrimageHome.nearby')}
            </ThemedText>
            {data.nearbyCount > 0 ? (
              <ThemedText variant="caption" tone="secondary">
                {t('tabs.pilgrimageHome.within3km', { count: data.nearbyCount })}
              </ThemedText>
            ) : null}
          </View>
          {data.locationStatus === 'pending' || (data.nearbyPending && !nearest) ? (
            <Skeleton.Block width="100%" height={170} borderRadius={Radius.card} />
          ) : null}
          {data.locationStatus === 'denied' || data.locationStatus === 'unavailable' ? (
            <ThemedSurface variant="card" padded style={styles.permission}>
              <ThemedText variant="bodyMedium" tone="secondary">
                {t('tabs.pilgrimageHome.locationNeeded')}
              </ThemedText>
              <ThemedButton
                label={t(
                  data.locationCanAskAgain
                    ? 'tabs.pilgrimageHome.enableLocation'
                    : 'tabs.pilgrimageHome.openSettings'
                )}
                onPress={() =>
                  data.locationCanAskAgain
                    ? void data.requestLocation()
                    : void Linking.openSettings()
                }
              />
            </ThemedSurface>
          ) : null}
          {data.locationStatus === 'granted' && nearest ? (
            <ThemedSurface variant="card" style={styles.hero}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={nearest.cn || nearest.name}
                onPress={() => {
                  hapticsBridge.tap();
                  router.push(
                    buildPilgrimageDetailRoute(nearest.bangumiId, {
                      returnTo: 'hub',
                      focusSpotId: nearest.pointId,
                      title: nearestTitle,
                      poster: nearestPoster,
                    })
                  );
                }}
                style={styles.heroMain}>
                <SpotImage
                  uri={normalizeAnitabiImageUrl(nearest.image, nearest.bangumiId)}
                  style={styles.heroImage}
                />
                <View style={styles.heroBody}>
                  {nearestTitle ? (
                    <ThemedText variant="caption" tone="secondary" numberOfLines={1}>
                      {nearestTitle}
                    </ThemedText>
                  ) : null}
                  <ThemedText variant="titleMedium" weight="700" numberOfLines={2}>
                    {nearest.cn || nearest.name}
                  </ThemedText>
                  <ThemedText variant="bodySmall" tone="secondary">
                    {nearest.distanceKm.toFixed(1)} km
                  </ThemedText>
                </View>
              </Pressable>
              <ThemedButton
                label={t('tabs.pilgrimageHome.depart')}
                size="sm"
                onPress={() =>
                  void Linking.openURL(
                    buildMapsURL(nearest.lat, nearest.lng, nearest.cn || nearest.name)
                  )
                }
                style={styles.heroAction}
              />
            </ThemedSurface>
          ) : null}
          {nearEmpty ? (
            <ThemedText variant="bodyMedium" tone="secondary">
              {t('tabs.pilgrimageHome.noNearby')}
            </ThemedText>
          ) : null}
          {data.nearbyError && !nearest ? (
            <ThemedText variant="bodyMedium" tone="secondary">
              {t('tabs.pilgrimageHome.nearbyUnavailable')}
            </ThemedText>
          ) : null}
        </View>
        {nearEmpty ? <ExplorerDiscoverSection data={data} onOpenAnime={openAnime} /> : null}
        {data.collectionWithSpots.length ? (
          <View style={styles.section}>
            <ThemedText variant="titleLarge" weight="700">
              {t('tabs.pilgrimageHome.myWorks')}
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}>
              {data.collectionWithSpots.slice(0, RAIL_LIMIT).map((anime) => (
                <CollectionPoster
                  key={anime.id}
                  anime={anime}
                  visited={data.visited}
                  onPress={() => openAnime(anime)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
        {!nearEmpty ? <ExplorerDiscoverSection data={data} onOpenAnime={openAnime} /> : null}
        {data.error ? (
          <ThemedText variant="bodyMedium" tone="secondary">
            {data.error}
          </ThemedText>
        ) : null}
        <AnitabiAttributionFooter bangumiId={null} variant="footer" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing.screenPadding, paddingTop: Spacing.md, gap: Spacing.lg },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  search: {
    minHeight: Size.minTouchTarget,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  shortcuts: { flexDirection: 'row', gap: Spacing.sm },
  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  permission: { gap: Spacing.md },
  hero: { overflow: 'hidden', borderRadius: Radius.card, paddingBottom: Spacing.sm },
  heroMain: { flexDirection: 'row' },
  heroImage: { width: 112, minHeight: 158 },
  heroBody: { flex: 1, padding: Spacing.md, gap: Spacing.xs, alignItems: 'flex-start' },
  heroAction: { alignSelf: 'flex-end', marginHorizontal: Spacing.sm },
  rail: { gap: Spacing.sm, paddingRight: Spacing.screenPadding },
});
