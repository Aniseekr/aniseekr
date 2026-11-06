import { useMemo } from 'react';
import { FlatList, Linking, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedButton, ThemedText, Skeleton } from '../../../../components/themed';
import { SpotImage } from '../../../../components/pilgrimage/SpotImage';
import { NearbySpotRow } from '../../../../components/pilgrimage/home/ExplorerHomeRows';
import { usePilgrimageHubScreenData } from '../../../../hooks/usePilgrimageHubScreenData';
import { useTheme } from '../../../../context/ThemeContext';
import { Radius, Spacing } from '../../../../constants/DesignSystem';
import { useI18n, useT } from '../../../../libs/i18n';
import { bangumiSubjectImageUrl } from '../../../../libs/clients/bangumi-client';
import { getPilgrimageAnimeTitles } from '../../../../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageDetailRoute } from '../../../../libs/services/pilgrimage/pilgrimage-navigation';
import { pilgrimageRepository } from '../../../../libs/services/pilgrimage/pilgrimage-repository';
import { ANIME_TOURISM_88_REGIONS } from '../../../../libs/services/pilgrimage/anime88-repository';
import { buildMapsURL } from '../../../../components/pilgrimage/detail';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import type { PilgrimageWork } from '../../../../libs/services/pilgrimage/types';
import type { NearbySpotHit } from '../../../../libs/services/pilgrimage/spot-index';
import type { UniqueAnime88Entry } from '../../../../libs/services/pilgrimage/anime88-repository';

type ListKind = 'nearby' | 'popular' | 'tourism88';

export default function PilgrimageListScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: ListKind =
    params.kind === 'nearby' || params.kind === 'tourism88' ? params.kind : 'popular';
  const data = usePilgrimageHubScreenData();
  const router = useRouter();
  const t = useT();
  const { language } = useI18n();
  const { theme } = useTheme();
  const title =
    kind === 'nearby'
      ? t('tabs.pilgrimageHome.nearby')
      : kind === 'popular'
        ? t('tabs.pilgrimageHome.popular')
        : t('tabs.pilgrimageHome.tourism88');

  const tourismSections = useMemo(
    () =>
      ANIME_TOURISM_88_REGIONS.map((region) => ({
        region,
        data: data.tourism88Entries.filter((entry) => entry.regions.includes(region)),
      })).filter((section) => section.data.length > 0),
    [data.tourism88Entries]
  );

  const openWork = (work: PilgrimageWork) => {
    hapticsBridge.tap();
    router.push(
      buildPilgrimageDetailRoute(work.key, {
        returnTo: 'hub',
        title: getPilgrimageAnimeTitles(work, { appLanguage: language }).primary,
        poster: work.bgm?.[0] ? bangumiSubjectImageUrl(work.bgm[0], 'common') : undefined,
      })
    );
  };

  const open88Entry = (entry: UniqueAnime88Entry) => {
    const place = entry.locations[0];
    const work = data.allWorks.find((candidate) => candidate.bgm?.includes(entry.bangumiId));
    const titleText = work
      ? getPilgrimageAnimeTitles(work, { appLanguage: language }).primary
      : getPilgrimageAnimeTitles(
          { titleJa: entry.titleJa, titleEnglish: entry.titleEn },
          { appLanguage: language }
        ).primary;
    const poster = work?.bgm?.[0] ? bangumiSubjectImageUrl(work.bgm[0], 'common') : entry.posterUrl;
    hapticsBridge.tap();
    router.push(
      buildPilgrimageDetailRoute(String(entry.bangumiId), {
        returnTo: 'hub',
        title: titleText,
        titleJa: entry.titleJa,
        titleEn: entry.titleEn,
        malId: place?.externalIds.mal,
        anilistId: place?.externalIds.anilist,
        poster,
      })
    );
  };

  const renderNearby = ({ item }: { item: NearbySpotHit }) => {
    const work = data.allWorks.find((candidate) => candidate.key === item.workKey);
    const poster = work?.bgm?.[0] ? bangumiSubjectImageUrl(work.bgm[0], 'common') : undefined;
    return (
      <NearbySpotRow
        hit={item}
        title={work ? getPilgrimageAnimeTitles(work, { appLanguage: language }).primary : ''}
        posterUri={poster}
        departLabel={t('tabs.pilgrimageHome.depart')}
        onPress={() => {
          hapticsBridge.tap();
          router.push(
            buildPilgrimageDetailRoute(item.workKey, {
              returnTo: 'hub',
              focusSpotId: item.spotId,
              title: work
                ? getPilgrimageAnimeTitles(work, { appLanguage: language }).primary
                : undefined,
              poster,
            })
          );
        }}
        onPressIn={() =>
          void pilgrimageRepository.getSpotsByKey(item.workKey).catch(() => undefined)
        }
        onDepart={() => void Linking.openURL(buildMapsURL(item.lat, item.lon, item.name))}
      />
    );
  };

  return (
    <SafeAreaView
      edges={['bottom']}
      style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerBackTitle: t('tabs.pilgrimage'),
          headerTintColor: theme.text.primary,
          headerStyle: { backgroundColor: theme.background.primary },
        }}
      />
      {kind === 'nearby' ? (
        data.nearbyPending || data.locationStatus === 'pending' ? (
          <Skeleton.AnimeCardList count={5} />
        ) : data.locationStatus !== 'granted' ? (
          <EmptyState
            message={t('tabs.pilgrimageHome.locationNeeded')}
            actionLabel={t(
              data.locationCanAskAgain
                ? 'tabs.pilgrimageHome.enableLocation'
                : 'tabs.pilgrimageHome.openSettings'
            )}
            onAction={() =>
              data.locationCanAskAgain ? void data.requestLocation() : void Linking.openSettings()
            }
          />
        ) : data.nearbyError ? (
          <EmptyState message={t('tabs.pilgrimageHome.nearbyUnavailable')} />
        ) : data.nearbySpots.length === 0 ? (
          <EmptyState message={t('tabs.pilgrimageHome.noNearbyWithin3km')} />
        ) : (
          <FlatList
            data={data.nearbySpots}
            keyExtractor={(item) => `${item.workKey}:${item.spotId}`}
            renderItem={renderNearby}
            contentContainerStyle={styles.listContent}
          />
        )
      ) : null}

      {kind === 'popular' ? (
        data.popularList.length === 0 ? (
          <EmptyState message={t('tabs.pilgrimageHome.noPopular')} />
        ) : (
          <FlatList
            data={data.popularList}
            keyExtractor={(work) => work.key}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const titleText = getPilgrimageAnimeTitles(item, { appLanguage: language }).primary;
              const poster = item.bgm?.[0]
                ? bangumiSubjectImageUrl(item.bgm[0], 'common')
                : undefined;
              return (
                <WorkListRow
                  title={titleText}
                  meta={t('tabs.pilgrimageHome.spotCount', { count: item.n })}
                  poster={poster}
                  onPress={() => openWork(item)}
                  onPressIn={() =>
                    void pilgrimageRepository.getSpotsByKey(item.key).catch(() => undefined)
                  }
                />
              );
            }}
          />
        )
      ) : null}

      {kind === 'tourism88' && tourismSections.length === 0 ? (
        <EmptyState message={t('tabs.pilgrimageHome.noTourism88')} />
      ) : null}

      {kind === 'tourism88' && tourismSections.length > 0 ? (
        <SectionList
          sections={tourismSections}
          keyExtractor={(entry, index) => `${entry.bangumiId}:${index}`}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <ThemedText variant="titleMedium" weight="700" style={styles.regionHeader}>
              {getRegionLabel(t, section.region)}
            </ThemedText>
          )}
          renderItem={({ item, section }) => {
            const work = data.allWorks.find((candidate) => candidate.bgm?.includes(item.bangumiId));
            const titleText = work
              ? getPilgrimageAnimeTitles(work, { appLanguage: language }).primary
              : getPilgrimageAnimeTitles(
                  { titleJa: item.titleJa, titleEnglish: item.titleEn },
                  { appLanguage: language }
                ).primary;
            const place =
              item.locations.find((location) => location.region === section.region) ??
              item.locations[0];
            const meta = place ? `${place.prefecture} ${place.city}`.trim() : '';
            const poster = work?.bgm?.[0]
              ? bangumiSubjectImageUrl(work.bgm[0], 'common')
              : item.posterUrl;
            return (
              <WorkListRow
                title={titleText}
                meta={meta}
                poster={poster}
                onPress={() => open88Entry(item)}
                onPressIn={() =>
                  void pilgrimageRepository
                    .getSpotsForAnime({
                      bangumiId: item.bangumiId,
                      malId: place?.externalIds.mal,
                      anilistId: place?.externalIds.anilist,
                      titleJa: item.titleJa,
                      titleEn: item.titleEn,
                    })
                    .catch(() => undefined)
                }
              />
            );
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function getRegionLabel(
  t: ReturnType<typeof useT>,
  region: (typeof ANIME_TOURISM_88_REGIONS)[number]
): string {
  switch (region) {
    case 'hokkaido_tohoku':
      return t('tabs.pilgrimageHome.regions.hokkaido_tohoku');
    case 'kanto':
      return t('tabs.pilgrimageHome.regions.kanto');
    case 'tokyo':
      return t('tabs.pilgrimageHome.regions.tokyo');
    case 'chubu':
      return t('tabs.pilgrimageHome.regions.chubu');
    case 'kinki':
      return t('tabs.pilgrimageHome.regions.kinki');
    case 'chugoku_shikoku':
      return t('tabs.pilgrimageHome.regions.chugoku_shikoku');
    case 'kyushu_okinawa':
      return t('tabs.pilgrimageHome.regions.kyushu_okinawa');
  }
}

function WorkListRow({
  title,
  meta,
  poster,
  onPress,
  onPressIn,
}: {
  title: string;
  meta: string;
  poster?: string | null;
  onPress: () => void;
  onPressIn: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      onPressIn={onPressIn}
      style={styles.workRow}>
      <SpotImage uri={poster ?? ''} contentPosition="top" style={styles.poster} />
      <View style={styles.workCopy}>
        <ThemedText variant="bodyMedium" weight="700" numberOfLines={2}>
          {title}
        </ThemedText>
        <ThemedText variant="caption" tone="secondary" numberOfLines={1}>
          {meta}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <ThemedText variant="bodyMedium" tone="secondary" align="center">
        {message}
      </ThemedText>
      {actionLabel && onAction ? <ThemedButton label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  workRow: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  poster: { width: 56, height: 80, borderRadius: Radius.sm },
  workCopy: { flex: 1, justifyContent: 'center', gap: Spacing.xs },
  regionHeader: { paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
});
