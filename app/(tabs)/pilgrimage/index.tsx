import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
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
import { ExplorerMapView } from '../../../components/pilgrimage/home/ExplorerMapView';
import {
  usePilgrimageHubScreenData,
  type UsePilgrimageHubScreenData,
} from '../../../hooks/usePilgrimageHubScreenData';
import { useExperienceMode } from '../../../hooks/useExperienceMode';
import { useTheme } from '../../../context/ThemeContext';
import { bottomPad, Radius, Spacing, TabBar } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import { buildMapsURL } from '../../../components/pilgrimage/detail';
import type { PilgrimageWork } from '../../../libs/services/pilgrimage/types';
import { bangumiSubjectImageUrl } from '../../../libs/clients/bangumi-client';
import {
  CollectionPoster,
  NearbySpotRow,
} from '../../../components/pilgrimage/home/ExplorerHomeRows';
import { ExplorerDiscoverSection } from '../../../components/pilgrimage/home/ExplorerDiscoverSection';
import { HomeSearchField } from '../../../components/common/HomeSearchField';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import type { NearbySpotHit } from '../../../libs/services/pilgrimage/spot-index';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';

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
  const nearEmpty =
    data.locationStatus === 'granted' &&
    !data.nearbyPending &&
    !data.nearbyError &&
    data.nearbyCoverage === 'known' &&
    data.nearbyCount === 0;
  const bottom = bottomPad(insets) + TabBar.height;

  const openAnime = (anime: PilgrimageWork) => {
    router.push(
      buildPilgrimageDetailRoute(anime.key, {
        returnTo: 'hub',
        title: getPilgrimageAnimeTitles(anime).primary,
        poster: anime.bgm?.[0] ? bangumiSubjectImageUrl(anime.bgm[0], 'common') : undefined,
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
        <HomeSearchField
          label={t('tabs.pilgrimageHome.search')}
          onPress={() => router.push({ pathname: '/search', params: { context: 'pilgrimage' } })}
        />
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
            {data.nearbyCoverage === 'known' && data.nearbyCount > 0 ? (
              <ThemedButton
                label={t('tabs.pilgrimageHome.all')}
                variant="ghost"
                size="sm"
                onPress={() => router.push('/pilgrimage/list/nearby')}
              />
            ) : null}
          </View>
          {data.locationStatus === 'pending' || data.nearbyPending ? (
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
          {data.locationStatus === 'granted' && data.nearbySpots.length ? (
            <View style={styles.nearbyRows}>
              {data.nearbySpots.slice(0, 3).map((hit) => (
                <NearbyRow
                  key={`${hit.workKey}:${hit.spotId}`}
                  hit={hit}
                  works={data.allWorks}
                  onPress={() => {
                    hapticsBridge.tap();
                    const work = data.allWorks.find((item) => item.key === hit.workKey);
                    router.push(
                      buildPilgrimageDetailRoute(hit.workKey, {
                        returnTo: 'hub',
                        focusSpotId: hit.spotId,
                        title: work ? getPilgrimageAnimeTitles(work).primary : undefined,
                        poster: work?.bgm?.[0]
                          ? bangumiSubjectImageUrl(work.bgm[0], 'common')
                          : undefined,
                      })
                    );
                  }}
                  onPrefetch={() =>
                    void pilgrimageRepository.getSpotsByKey(hit.workKey).catch(() => undefined)
                  }
                />
              ))}
            </View>
          ) : null}
          {nearEmpty ? (
            <ThemedText variant="bodyMedium" tone="secondary">
              {t('tabs.pilgrimageHome.noNearbyWithin3km')}
            </ThemedText>
          ) : null}
          {data.nearbyError ? (
            <ThemedText variant="bodyMedium" tone="secondary">
              {t('tabs.pilgrimageHome.nearbyUnavailable')}
            </ThemedText>
          ) : null}
        </View>
        {nearEmpty ? <ExplorerDiscoverSection data={data} /> : null}
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
                  key={anime.key}
                  anime={anime}
                  visited={data.visited}
                  onPress={() => openAnime(anime)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
        {!nearEmpty ? <ExplorerDiscoverSection data={data} /> : null}
        {data.error ? (
          <ThemedText variant="bodyMedium" tone="secondary">
            {data.error}
          </ThemedText>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function NearbyRow({
  hit,
  works,
  onPress,
  onPrefetch,
}: {
  hit: NearbySpotHit;
  works: PilgrimageWork[];
  onPress: () => void;
  onPrefetch: () => void;
}) {
  const t = useT();
  const work = works.find((item) => item.key === hit.workKey);
  const poster = work?.bgm?.[0] ? bangumiSubjectImageUrl(work.bgm[0], 'common') : undefined;
  return (
    <NearbySpotRow
      hit={hit}
      title={work ? getPilgrimageAnimeTitles(work).primary : ''}
      posterUri={poster}
      departLabel={t('tabs.pilgrimageHome.depart')}
      onPress={onPress}
      onPressIn={onPrefetch}
      onDepart={() => void Linking.openURL(buildMapsURL(hit.lat, hit.lon, hit.name))}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing.screenPadding, paddingTop: Spacing.md, gap: Spacing.lg },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  shortcuts: { flexDirection: 'row', gap: Spacing.sm },
  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  permission: { gap: Spacing.md },
  nearbyRows: { gap: Spacing.xs },
  rail: { gap: Spacing.sm, paddingRight: Spacing.screenPadding },
});
