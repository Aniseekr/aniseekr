import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedButton, ThemedText } from '../../themed';
import { useStampRallyRows } from '../rally/useStampRallyRows';
import { PosterRailCard } from './PosterRailCard';
import { RallyDiscoverCard } from './RallyDiscoverCard';
import { Spacing } from '../../../constants/DesignSystem';
import { useI18n, useT } from '../../../libs/i18n';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import {
  buildPilgrimageDetailRoute,
  buildPilgrimageEventDetailRoute,
} from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import { selectDiscoverRallies } from '../../../libs/services/pilgrimage/locality/stamp-rally';
import { resolveLocalIntelText } from '../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { bangumiSubjectImageUrl } from '../../../libs/clients/bangumi-client';
import type { PilgrimageWork } from '../../../libs/services/pilgrimage/types';
import type { UsePilgrimageHubScreenData } from '../../../hooks/usePilgrimageHubScreenData';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

const RAIL_LIMIT = 15;

export function ExplorerDiscoverSection({ data }: { data: UsePilgrimageHubScreenData }) {
  const router = useRouter();
  const t = useT();
  const { language } = useI18n();
  const { rows } = useStampRallyRows();
  const rallies = selectDiscoverRallies(rows);

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

  return (
    <View style={styles.section}>
      {data.popularList.length ? (
        <View style={styles.category}>
          <SectionHeader
            title={t('tabs.pilgrimageHome.popular')}
            onAll={() => router.push('/pilgrimage/list/popular')}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}>
            {data.popularList.slice(0, RAIL_LIMIT).map((work) => {
              const title = getPilgrimageAnimeTitles(work, { appLanguage: language }).primary;
              return (
                <PosterRailCard
                  key={work.key}
                  accessibilityLabel={title}
                  imageUri={
                    work.bgm?.[0] ? bangumiSubjectImageUrl(work.bgm[0], 'common') : undefined
                  }
                  title={
                    <ThemedText variant="caption" weight="700" numberOfLines={1}>
                      {title}
                    </ThemedText>
                  }
                  meta={
                    <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                      {t('tabs.pilgrimageHome.spotCount', { count: work.n })}
                    </ThemedText>
                  }
                  onPress={() => openWork(work)}
                  onPressIn={() =>
                    void pilgrimageRepository.getSpotsByKey(work.key).catch(() => undefined)
                  }
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {data.tourism88Entries.length ? (
        <View style={styles.category}>
          <SectionHeader
            title={t('tabs.pilgrimageHome.tourism88')}
            onAll={() => router.push('/pilgrimage/list/tourism88')}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}>
            {data.tourism88Entries.slice(0, RAIL_LIMIT).map((entry) => {
              const work = find88Work(data, entry.bangumiId);
              const title = work
                ? getPilgrimageAnimeTitles(work, { appLanguage: language }).primary
                : getPilgrimageAnimeTitles(
                    { titleJa: entry.titleJa, titleEnglish: entry.titleEn },
                    { appLanguage: language }
                  ).primary;
              const place = entry.locations[0];
              const region = place ? `${place.prefecture} ${place.city}`.trim() : '';
              const poster = work?.bgm?.[0]
                ? bangumiSubjectImageUrl(work.bgm[0], 'common')
                : entry.posterUrl;
              return (
                <PosterRailCard
                  key={entry.bangumiId}
                  accessibilityLabel={title}
                  imageUri={poster}
                  title={
                    <ThemedText variant="caption" weight="700" numberOfLines={1}>
                      {title}
                    </ThemedText>
                  }
                  meta={
                    <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                      {region}
                    </ThemedText>
                  }
                  onPress={() => {
                    hapticsBridge.tap();
                    router.push(
                      buildPilgrimageDetailRoute(String(entry.bangumiId), {
                        returnTo: 'hub',
                        title,
                        titleJa: entry.titleJa,
                        titleEn: entry.titleEn,
                        malId: place?.externalIds.mal,
                        anilistId: place?.externalIds.anilist,
                        poster,
                      })
                    );
                  }}
                  onPressIn={() =>
                    void pilgrimageRepository
                      .getSpotsForAnime({
                        bangumiId: entry.bangumiId,
                        malId: place?.externalIds.mal,
                        anilistId: place?.externalIds.anilist,
                        titleJa: entry.titleJa,
                        titleEn: entry.titleEn,
                      })
                      .catch(() => undefined)
                  }
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {rallies.length ? (
        <View style={styles.category}>
          <SectionHeader
            title={t('tabs.pilgrimageHome.rallies')}
            onAll={() => router.push('/pilgrimage/news')}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}>
            {rallies.slice(0, RAIL_LIMIT).map((row) => {
              return (
                <RallyDiscoverCard
                  key={row.event.id}
                  row={row}
                  works={data.allWorks}
                  onPress={() => {
                    hapticsBridge.tap();
                    const name = resolveLocalIntelText(row.event.name, language).value;
                    router.push(
                      buildPilgrimageEventDetailRoute(row.event.id, {
                        name,
                      })
                    );
                  }}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function SectionHeader({ title, onAll }: { title: string; onAll: () => void }) {
  const t = useT();
  return (
    <View style={styles.header}>
      <ThemedText variant="titleLarge" weight="700">
        {title}
      </ThemedText>
      <ThemedButton
        label={t('tabs.pilgrimageHome.all')}
        variant="ghost"
        size="sm"
        onPress={onAll}
      />
    </View>
  );
}

function find88Work(
  data: UsePilgrimageHubScreenData,
  bangumiId: number
): PilgrimageWork | undefined {
  return data.allWorks.find((work) => work.bgm?.includes(bangumiId));
}

const styles = StyleSheet.create({
  section: { gap: Spacing.lg },
  category: { gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rail: { gap: Spacing.sm, paddingRight: Spacing.screenPadding },
});
