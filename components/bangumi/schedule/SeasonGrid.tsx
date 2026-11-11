import { memo, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated from 'react-native-reanimated';
import type { Anime } from '../../rate/types';
import {
  AnimeTitleText,
  ThemedButton,
  ThemedIconButton,
  ThemedText,
  withAlpha,
} from '../../themed';
import { ProgressiveImage } from '../../common/ProgressiveImage';
import { TYPE_FILTER_LABELS, type BangumiTypeFilter } from '../BangumiSettingsSheet';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { useToggleBounce } from '../../../libs/animations/use-toggle-bounce';
import { formatScore } from '../../../libs/utils/format-score';
import { prefetchAnimeDetail, pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

/** 12345 → "12.3k". Plain digits below 1000. */
export function formatListCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

export type SeasonSort = 'popular' | 'score' | 'start';
export const SEASON_SORTS: readonly SeasonSort[] = ['popular', 'score', 'start'];

const SORT_LABELS = {
  popular: 'tabs.schedule.sort.popular',
  score: 'tabs.schedule.sort.score',
  start: 'tabs.schedule.sort.start',
} as const satisfies Record<SeasonSort, string>;

const COLUMNS = 3;

function startKey(anime: Anime): number {
  const d = anime.startDate;
  if (!d?.year) return Number.MAX_SAFE_INTEGER;
  return d.year * 10000 + (d.month ?? 12) * 100 + (d.day ?? 31);
}

/** Sort a season. Titles missing the metric go last, never get a made-up value. */
export function sortSeason(list: Anime[], sort: SeasonSort): Anime[] {
  const copy = [...list];
  if (sort === 'start') return copy.sort((a, b) => startKey(a) - startKey(b));
  const metric = (a: Anime) => (sort === 'score' ? a.score : a.anilistListCount) ?? -1;
  return copy.sort((a, b) => metric(b) - metric(a));
}

/**
 * Whole-season browser: sort + format chips over a 3-column poster grid with
 * one-tap 想看. Replaces the old one-line rank list.
 */
export function SeasonGrid({
  anime,
  sort,
  onSortChange,
  typeFilter,
  onTypeFilterChange,
  pickedIds,
  onTogglePick,
  onLongPress,
}: {
  anime: Anime[];
  sort: SeasonSort;
  onSortChange: (sort: SeasonSort) => void;
  typeFilter: BangumiTypeFilter;
  onTypeFilterChange: (filter: BangumiTypeFilter) => void;
  pickedIds: ReadonlySet<string>;
  onTogglePick: (anime: Anime, picked: boolean) => void;
  onLongPress: (anime: Anime) => void;
}) {
  const t = useT();
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor(
    (width - Spacing.screenPadding * 2 - Spacing.xs * (COLUMNS - 1)) / COLUMNS
  );
  const sorted = useMemo(() => sortSeason(anime, sort), [anime, sort]);
  return (
    <View style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {SEASON_SORTS.map((value) => (
          <ThemedButton
            key={value}
            size="sm"
            haptic="selection"
            label={t(SORT_LABELS[value])}
            variant={sort === value ? 'primary' : 'secondary'}
            onPress={() => onSortChange(value)}
          />
        ))}
        <View style={styles.chipDivider} />
        {(Object.keys(TYPE_FILTER_LABELS) as BangumiTypeFilter[]).map((filter) => (
          <ThemedButton
            key={filter}
            size="sm"
            haptic="selection"
            label={t(TYPE_FILTER_LABELS[filter])}
            variant={typeFilter === filter ? 'primary' : 'ghost'}
            onPress={() => onTypeFilterChange(filter)}
          />
        ))}
      </ScrollView>
      <View style={styles.grid}>
        {sorted.map((item) => (
          <SeasonTile
            key={item.id}
            anime={item}
            width={tileWidth}
            sort={sort}
            picked={pickedIds.has(item.id)}
            onTogglePick={onTogglePick}
            onLongPress={onLongPress}
          />
        ))}
      </View>
    </View>
  );
}

const SeasonTile = memo(function SeasonTile({
  anime,
  width,
  sort,
  picked,
  onTogglePick,
  onLongPress,
}: {
  anime: Anime;
  width: number;
  sort: SeasonSort;
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
  // Show the figure the grid is sorted by; fall back to whichever is real.
  const meta =
    sort === 'start' && start?.month && start.day
      ? { icon: 'event' as const, text: `${start.month}/${start.day}` }
      : sort === 'score' && score
        ? { icon: 'star' as const, text: score }
        : anime.anilistListCount
          ? { icon: 'group' as const, text: formatListCount(anime.anilistListCount) }
          : score
            ? { icon: 'star' as const, text: score }
            : null;
  return (
    <View style={{ width }}>
      <Pressable
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
        }}
        style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}>
        <ProgressiveImage
          source={{ uri: anime.image }}
          containerStyle={{ width, height: Math.round(width * 1.42) }}
          borderRadius={Radius.sm}
        />
        <AnimeTitleText
          anime={anime}
          numberOfLines={2}
          style={[Typography.caption, { color: theme.text.primary }]}
        />
        {meta ? (
          <View style={styles.meta}>
            <MaterialIcons name={meta.icon} size={12} color={theme.text.tertiary} />
            <ThemedText variant="captionSmall" tone="tertiary">
              {meta.text}
            </ThemedText>
          </View>
        ) : null}
      </Pressable>
      <Animated.View style={[styles.pick, pickStyle]}>
        <ThemedIconButton
          size={44}
          variant="ghost"
          haptic="selection"
          accessibilityLabel={t(picked ? 'tabs.schedule.rank.unpick' : 'tabs.schedule.rank.pick')}
          onPress={() => onTogglePick(anime, picked)}
          icon={() => (
            <View
              style={[
                styles.pickBadge,
                { backgroundColor: withAlpha(theme.background.primary, 0.82) },
              ]}>
              <MaterialIcons
                name={picked ? 'bookmark' : 'bookmark-border'}
                size={18}
                color={picked ? theme.accent : theme.text.primary}
              />
            </View>
          )}
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: Spacing.sm },
  chips: { gap: Spacing.xxs, alignItems: 'center' },
  chipDivider: { width: Spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.xs, rowGap: Spacing.md },
  tile: { gap: Spacing.xxs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pick: { position: 'absolute', top: 0, right: 0 },
  pickBadge: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
