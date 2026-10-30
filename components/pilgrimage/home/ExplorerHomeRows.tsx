import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../themed';
import { SpotImage } from '../SpotImage';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { resolveHubAnimeProgress } from '../../../libs/services/pilgrimage/pilgrimage-hub-progress';
import { CacheService } from '../../../libs/services/cache-service';
import { DETAIL_CACHE_KEY_PREFIX } from '../../../libs/services/pilgrimage/anitabi-service';
import type { AnitabiBangumi, AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

export function CollectionPoster({
  anime,
  visited,
  onPress,
}: {
  anime: AnitabiBangumi;
  visited: VisitedMap;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const fullPoints = CacheService.getSync<AnitabiPoint[]>(DETAIL_CACHE_KEY_PREFIX + anime.id);
  const progress = resolveHubAnimeProgress(anime, visited, fullPoints);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={getPilgrimageAnimeTitles(anime).primary}
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
      style={styles.posterCard}>
      <SpotImage uri={anime.cover} style={styles.poster} />
      <ThemedText variant="caption" weight="700" numberOfLines={1}>
        {getPilgrimageAnimeTitles(anime).primary}
      </ThemedText>
      <View style={[styles.track, { backgroundColor: theme.background.tertiary }]}>
        {progress.total ? (
          <View
            style={[
              styles.trackFill,
              {
                backgroundColor: theme.accent,
                width: `${Math.min(100, (progress.visitedCount / progress.total) * 100)}%`,
              },
            ]}
          />
        ) : null}
      </View>
      <ThemedText variant="captionSmall" tone="secondary">
        {progress.total !== null
          ? t('tabs.pilgrimageHome.visitedProgress', {
              visited: progress.visitedCount,
              total: progress.total,
            })
          : t('tabs.pilgrimageHome.spotCount', { count: anime.pointsLength })}
      </ThemedText>
    </Pressable>
  );
}

export function AnimeRow({ anime, onPress }: { anime: AnitabiBangumi; onPress: () => void }) {
  const t = useT();
  return (
    <DiscoveryRow
      title={getPilgrimageAnimeTitles(anime).primary}
      subtitle={t('tabs.pilgrimageHome.spotCount', { count: anime.pointsLength })}
      image={<SpotImage uri={anime.cover} style={styles.rowThumb} />}
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
    />
  );
}

export function DiscoveryRow({
  title,
  subtitle,
  image,
  onPress,
}: {
  title: string;
  subtitle: string;
  image: ReactNode;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={[styles.row, { borderBottomColor: theme.glassBorder }]}>
      {image}
      <View style={styles.flex}>
        <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText variant="caption" tone="secondary" numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
    </Pressable>
  );
}

export const rowThumbStyle = { width: 56, height: 56, borderRadius: Radius.sm } as const;

const styles = StyleSheet.create({
  posterCard: { width: 112, gap: Spacing.xxs },
  poster: { width: 112, height: 158, borderRadius: Radius.sm },
  track: { height: Spacing.xxs, borderRadius: Radius.full, overflow: 'hidden' },
  trackFill: { height: '100%' },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  rowThumb: rowThumbStyle,
});
