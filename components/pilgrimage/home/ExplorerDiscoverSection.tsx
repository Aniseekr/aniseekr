import { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedButton, ThemedText } from '../../themed';
import { SpotImage } from '../SpotImage';
import { RallyPoster } from '../rally/RallyPoster';
import { useStampRallyRows } from '../rally/useStampRallyRows';
import { AnimeRow, DiscoveryRow, rowThumbStyle } from './ExplorerHomeRows';
import { Spacing } from '../../../constants/DesignSystem';
import { useT, useI18n } from '../../../libs/i18n';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import {
  buildPilgrimageDetailRoute,
  buildPilgrimageEventDetailRoute,
} from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import { selectDiscoverRallies } from '../../../libs/services/pilgrimage/locality/stamp-rally';
import { resolveLocalIntelText } from '../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import type { UsePilgrimageHubScreenData } from '../../../hooks/usePilgrimageHubScreenData';

type DiscoverCategory = 'popular' | 'tourism88' | 'rallies';
const RAIL_LIMIT = 8;

export function ExplorerDiscoverSection({
  data,
  onOpenAnime,
}: {
  data: UsePilgrimageHubScreenData;
  onOpenAnime: (anime: AnitabiBangumi) => void;
}) {
  const router = useRouter();
  const t = useT();
  const { language } = useI18n();
  const { rows } = useStampRallyRows();
  const rallies = useMemo(() => selectDiscoverRallies(rows), [rows]);
  const categories = useMemo(
    () => [
      ...(data.popularList.length ? ['popular' as const] : []),
      ...(data.tourism88Entries.length ? ['tourism88' as const] : []),
      ...(rallies.length ? ['rallies' as const] : []),
    ],
    [data.popularList.length, data.tourism88Entries.length, rallies.length]
  );
  const [category, setCategory] = useState<DiscoverCategory>('popular');
  const active = categories.includes(category) ? category : categories[0];
  if (!active) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText variant="titleLarge" weight="700">
          {t('tabs.pilgrimageHome.explore')}
        </ThemedText>
        {active === 'rallies' ? (
          <ThemedButton
            label={t('tabs.pilgrimageHome.all')}
            variant="ghost"
            size="sm"
            onPress={() => router.push('/pilgrimage/news')}
          />
        ) : null}
      </View>
      <View style={styles.chips}>
        {categories.map((item) => (
          <ThemedButton
            key={item}
            size="sm"
            variant={active === item ? 'primary' : 'secondary'}
            label={t(`tabs.pilgrimageHome.${item}`)}
            onPress={() => setCategory(item)}
          />
        ))}
      </View>
      {active === 'popular'
        ? data.popularList
            .slice(0, RAIL_LIMIT)
            .map((anime) => (
              <AnimeRow key={anime.id} anime={anime} onPress={() => onOpenAnime(anime)} />
            ))
        : null}
      {active === 'tourism88'
        ? data.tourism88Entries.slice(0, RAIL_LIMIT).map((entry) => {
            const anime =
              data.collectionAnimes.find((candidate) => candidate.id === entry.bangumiId) ??
              data.featuredAnimes.find((candidate) => candidate.id === entry.bangumiId);
            const title = anime
              ? getPilgrimageAnimeTitles(anime).primary
              : entry.titleJa || entry.titleEn;
            const region = entry.locations[0]
              ? `${entry.locations[0].prefecture} ${entry.locations[0].city}`.trim()
              : '';
            return (
              <DiscoveryRow
                key={entry.bangumiId}
                title={title}
                subtitle={region}
                image={<SpotImage uri={anime?.cover ?? entry.posterUrl} style={rowThumbStyle} />}
                onPress={() =>
                  router.push(
                    buildPilgrimageDetailRoute(entry.bangumiId, {
                      returnTo: 'hub',
                      title,
                      poster: anime?.cover ?? entry.posterUrl,
                    })
                  )
                }
              />
            );
          })
        : null}
      {active === 'rallies'
        ? rallies.slice(0, RAIL_LIMIT).map((row) => {
            const title = resolveLocalIntelText(row.event.name, language).value;
            const region = row.primaryLocation
              ? resolveLocalIntelText(row.primaryLocation, language).value
              : t('tabs.pilgrimageHome.spotCount', { count: row.stopCount });
            return (
              <DiscoveryRow
                key={row.event.id}
                title={title}
                subtitle={region}
                image={<RallyPoster bangumiId={row.event.animeIds[0]} style={rowThumbStyle} />}
                onPress={() =>
                  router.push(buildPilgrimageEventDetailRoute(row.event.id, { name: title }))
                }
              />
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
});
