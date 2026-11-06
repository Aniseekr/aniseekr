import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedButton, ThemedText } from '../../themed';
import { SpotImage } from '../SpotImage';
import { bangumiSubjectImageUrl } from '../../../libs/clients/bangumi-client';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import { resolveHubAnimeProgress } from '../../../libs/services/pilgrimage/pilgrimage-hub-progress';
import type { PilgrimageWork } from '../../../libs/services/pilgrimage/types';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import type { NearbySpotHit } from '../../../libs/services/pilgrimage/spot-index';
import { formatDistanceKm } from '../detail';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';

export function CollectionPoster({
  anime,
  visited,
  onPress,
}: {
  anime: PilgrimageWork;
  visited: VisitedMap;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const progress = resolveHubAnimeProgress(anime, visited);
  const bgmId = anime.bgm?.[0];
  const title = getPilgrimageAnimeTitles(anime).primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
      style={styles.posterCard}>
      <SpotImage
        uri={bgmId ? bangumiSubjectImageUrl(bgmId, 'common') : ''}
        contentPosition="top"
        style={styles.poster}
      />
      <ThemedText variant="caption" weight="700" numberOfLines={1}>
        {title}
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
          : t('tabs.pilgrimageHome.spotCount', { count: anime.n })}
      </ThemedText>
    </Pressable>
  );
}

export function AnimeRow({ anime, onPress }: { anime: PilgrimageWork; onPress: () => void }) {
  const t = useT();
  const bgmId = anime.bgm?.[0];
  return (
    <DiscoveryRow
      title={getPilgrimageAnimeTitles(anime).primary}
      subtitle={t('tabs.pilgrimageHome.spotCount', { count: anime.n })}
      image={
        <SpotImage
          uri={bgmId ? bangumiSubjectImageUrl(bgmId, 'common') : ''}
          contentPosition="top"
          style={styles.rowThumb}
        />
      }
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

export function NearbySpotRow({
  hit,
  title,
  posterUri,
  departLabel,
  onPress,
  onPressIn,
  onDepart,
}: {
  hit: NearbySpotHit;
  title: string;
  posterUri?: string | null;
  departLabel: string;
  onPress: () => void;
  onPressIn?: () => void;
  onDepart: () => void;
}) {
  return (
    <View style={styles.nearbyRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${hit.name}`}
        onPress={onPress}
        onPressIn={onPressIn}
        style={styles.nearbyMain}>
        <SpotImage uri={posterUri ?? ''} contentPosition="top" style={styles.nearbyPoster} />
        <View style={styles.nearbyCopy}>
          {title ? (
            <ThemedText variant="caption" tone="secondary" numberOfLines={1}>
              {title}
            </ThemedText>
          ) : null}
          <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
            {hit.name}
          </ThemedText>
          <ThemedText variant="caption" tone="secondary">
            {formatDistanceKm(hit.distanceKm)}
          </ThemedText>
        </View>
      </Pressable>
      <ThemedButton label={departLabel} size="sm" onPress={onDepart} />
    </View>
  );
}

export const rowThumbStyle = { width: 56, height: 56, borderRadius: Radius.sm } as const;

const styles = StyleSheet.create({
  posterCard: { width: 112, gap: Spacing.xxs },
  poster: { width: 112, height: 158, borderRadius: Radius.sm },
  track: { height: Spacing.xxs, borderRadius: Radius.sm, overflow: 'hidden' },
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
  nearbyRow: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  nearbyMain: {
    minHeight: 88,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  nearbyPoster: { width: 56, height: 80, borderRadius: Radius.sm },
  nearbyCopy: { flex: 1, gap: Spacing.xxs },
});
