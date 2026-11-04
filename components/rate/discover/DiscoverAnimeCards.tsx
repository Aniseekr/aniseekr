import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AnimeTitleText, ThemedText } from '../../themed';
import { FontFamily, Radius, Size, Spacing, Typography } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { airingWeekdayKey, formatAiringClock } from '../../../libs/utils/airing';
import { formatScore } from '../../../libs/utils/format-score';
import { prefetchAnimeDetail, pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';
import { useAnimeDisplayTitle } from '../../../libs/i18n/use-display-title';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { PosterRailCard } from '../../pilgrimage/home/PosterRailCard';
import type { Anime } from '../types';

export function SeasonalPoster({ anime }: { anime: Anime }) {
  const { theme } = useTheme();
  const router = useRouter();
  const t = useT();
  const title = useAnimeDisplayTitle(anime);
  const airingAt = anime.nextAiringEpisode?.airingAt;
  return (
    <PosterRailCard
      accessibilityLabel={title}
      imageUri={anime.image}
      title={
        <AnimeTitleText
          anime={anime}
          numberOfLines={1}
          style={[Typography.caption, styles.title, { color: theme.text.primary }]}
        />
      }
      meta={
        airingAt != null ? (
          <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
            {t('tabs.discoverHome.airingSlot', {
              weekday: t(airingWeekdayKey(airingAt)),
              time: formatAiringClock(airingAt),
            })}
          </ThemedText>
        ) : null
      }
      onPress={() => {
        hapticsBridge.tap();
        pushAnimeDetail(router, anime);
      }}
      onPressIn={() => prefetchAnimeDetail(anime)}
    />
  );
}

export function TrendingRow({ anime, rank }: { anime: Anime; rank: number }) {
  const { theme } = useTheme();
  const router = useRouter();
  const t = useT();
  const title = useAnimeDisplayTitle(anime);
  const score = formatScore(anime.score);
  const meta = [
    score != null ? `★ ${score}` : null,
    anime.episodes != null ? t('tabs.discoverHome.episodes', { count: anime.episodes }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => {
        hapticsBridge.tap();
        pushAnimeDetail(router, anime);
      }}
      onPressIn={() => prefetchAnimeDetail(anime)}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.85 : 1 }]}>
      <ThemedText
        variant="headlineMedium"
        weight="700"
        style={[styles.rank, { color: rank === 1 ? theme.accent : theme.text.tertiary }]}>
        {rank}
      </ThemedText>
      <Image
        source={{ uri: anime.image }}
        style={[styles.rowPoster, { backgroundColor: theme.background.secondary }]}
        contentFit="cover"
      />
      <View style={styles.body}>
        <AnimeTitleText
          anime={anime}
          numberOfLines={1}
          style={[Typography.titleSmall, { color: theme.text.primary }]}
        />
        {meta ? (
          <ThemedText variant="caption" tone="secondary">
            {meta}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { width: '100%' },
  row: {
    minHeight: Size.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: Spacing.sm,
    justifyContent: 'flex-start',
    gap: Spacing.sm,
  },
  rank: { width: 28, textAlign: 'center', fontFamily: FontFamily.display },
  rowPoster: { width: 44, height: 62, borderRadius: Radius.sm },
  body: { flex: 1, gap: Spacing.xxs },
});
