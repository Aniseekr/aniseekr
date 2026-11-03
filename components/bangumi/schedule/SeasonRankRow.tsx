import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated from 'react-native-reanimated';
import type { Anime } from '../../rate/types';
import { AnimeTitleText, ThemedIconButton, ThemedText } from '../../themed';
import { ProgressiveImage } from '../../common/ProgressiveImage';
import { FontFamily, Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { useToggleBounce } from '../../../libs/animations/use-toggle-bounce';
import { formatScore } from '../../../libs/utils/format-score';
import { prefetchAnimeDetail, pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import type { SeasonPhase } from '../../../libs/utils/season-utils';

/** 12345 → "12.3k". Plain digits below 1000. */
export function formatListCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

/**
 * One title in a ranked season list. Upcoming seasons rank by AniList list
 * count (pre-season anticipation), past seasons by score. The bookmark adds or
 * removes the title from "my season" in one tap.
 */
export const SeasonRankRow = memo(function SeasonRankRow({
  anime,
  rank,
  phase,
  picked,
  onTogglePick,
  onLongPress,
}: {
  anime: Anime;
  rank: number | null;
  phase: SeasonPhase;
  picked: boolean;
  onTogglePick: (anime: Anime, picked: boolean) => void;
  onLongPress: (anime: Anime) => void;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const pickStyle = useToggleBounce(picked);
  const score = formatScore(anime.score);
  const start = anime.startDate;
  const meta = [
    phase === 'past'
      ? score
        ? `★ ${score}`
        : null
      : anime.anilistListCount
        ? t('tabs.schedule.rank.listCount', { count: formatListCount(anime.anilistListCount) })
        : null,
    phase === 'upcoming' && start?.month && start.day
      ? t('tabs.schedule.rank.starts', { date: `${start.month}/${start.day}` })
      : null,
    anime.format ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.row, { borderBottomColor: theme.glassBorder }]}>
      <Pressable
        style={styles.main}
        accessibilityRole="button"
        accessibilityLabel={anime.title}
        onPressIn={() => prefetchAnimeDetail(anime)}
        onPress={() => {
          hapticsBridge.tap();
          pushAnimeDetail(router, anime);
        }}
        onLongPress={() => {
          hapticsBridge.selection();
          onLongPress(anime);
        }}>
        <ThemedText
          variant="titleMedium"
          weight="700"
          style={[styles.rank, { color: rank === 1 ? theme.accent : theme.text.tertiary }]}>
          {rank ?? '–'}
        </ThemedText>
        <ProgressiveImage
          source={{ uri: anime.image }}
          containerStyle={styles.poster}
          borderRadius={Radius.sm}
        />
        <View style={styles.body}>
          <AnimeTitleText
            anime={anime}
            numberOfLines={2}
            style={[Typography.titleSmall, { color: theme.text.primary }]}
          />
          {meta ? (
            <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1}>
              {meta}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>
      <Animated.View style={pickStyle}>
        <ThemedIconButton
          variant="ghost"
          haptic="selection"
          accessibilityLabel={t(picked ? 'tabs.schedule.rank.unpick' : 'tabs.schedule.rank.pick')}
          onPress={() => onTogglePick(anime, picked)}
          icon={(color) => (
            <MaterialIcons
              name={picked ? 'bookmark' : 'bookmark-border'}
              size={24}
              color={picked ? theme.accent : color}
            />
          )}
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rank: { width: 24, textAlign: 'center', fontFamily: FontFamily.display },
  poster: { width: 48, height: 68 },
  body: { flex: 1, gap: Spacing.xxs },
});
