// Horizontal rail for the Japanese Anime Tourism 88 selection on the
// pilgrimage hub. Sorted by AniList popularity descending; multi-city anime
// collapse to one card with a "+N cities" tag.

import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Spacing, Radius, Shadow, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { ThemedText, readableTextOn } from '../themed';
import { useT } from '../../libs/i18n';
import type {
  AnimeTourism88Region,
  UniqueAnime88Entry,
} from '../../libs/services/pilgrimage/anime88-repository';

const REGION_LABELS: Record<AnimeTourism88Region, string> = {
  hokkaido_tohoku: 'Hokkaido / Tohoku',
  kanto: 'Kanto',
  tokyo: 'Tokyo',
  chubu: 'Chubu',
  kinki: 'Kinki',
  chugoku_shikoku: 'Chugoku / Shikoku',
  kyushu_okinawa: 'Kyushu / Okinawa',
};

export interface Tourism88RailProps {
  entries: readonly UniqueAnime88Entry[];
  /** Bangumi ids the user already has in their collection. */
  collectionBangumiIds: ReadonlySet<number>;
  /** bangumiId → cover URL (typically resolved from anitabi-index). */
  coversById: ReadonlyMap<number, string>;
  onPressEntry: (entry: UniqueAnime88Entry) => void;
  onSeeAll?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Tourism88Rail({
  entries,
  collectionBangumiIds,
  coversById,
  onPressEntry,
  onSeeAll,
  style,
}: Tourism88RailProps) {
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (entries.length === 0) return null;
  return (
    <View style={[styles.section, style]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.officialBadge}>
            <ThemedText variant="captionSmall" weight="800" style={styles.officialBadgeLabel}>
              ★ Official
            </ThemedText>
          </View>
          <ThemedText variant="titleMedium" weight="700">
            {t('pilgrimageUi.animeTourism88')}
          </ThemedText>
        </View>
        {onSeeAll ? (
          <Pressable
            onPress={onSeeAll}
            hitSlop={10}
            style={({ pressed }) => [styles.seeAll, pressed && { opacity: 0.6 }]}>
            <ThemedText variant="captionSmall" weight="500" tone="secondary">
              {t('commonUi.seeAll')}
            </ThemedText>
            <Ionicons name="chevron-forward" size={12} color={theme.text.tertiary} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}>
        {entries.map((entry) => (
          <Tourism88RailCard
            key={entry.bangumiId}
            entry={entry}
            inCollection={collectionBangumiIds.has(entry.bangumiId)}
            cover={coversById.get(entry.bangumiId) ?? null}
            onPress={() => onPressEntry(entry)}
            theme={theme}
          />
        ))}
      </ScrollView>
    </View>
  );
}

interface Tourism88RailCardProps {
  entry: UniqueAnime88Entry;
  inCollection: boolean;
  cover: string | null;
  onPress: () => void;
  theme: ThemePalette;
}

function Tourism88RailCard({ entry, inCollection, cover, onPress, theme }: Tourism88RailCardProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const primaryEntry = entry.locations[0];
  const cityCount = entry.locations.length;
  const regionLabel = REGION_LABELS[primaryEntry.region];
  const title = entry.titleEn || entry.titleJa;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, Anime Tourism 88 entry`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      <View style={styles.posterWrap}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={styles.poster}
            contentFit="cover"
            transition={180}
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={[
              styles.poster,
              styles.posterPlaceholder,
              { backgroundColor: theme.background.tertiary },
            ]}>
            <Ionicons name="film-outline" size={24} color={theme.text.tertiary} />
          </View>
        )}
        <View style={styles.idChip}>
          <ThemedText variant="captionSmall" weight="800" style={styles.idChipLabel}>
            ★ #{primaryEntry.id}
          </ThemedText>
        </View>
        {inCollection ? (
          <View style={styles.collectedBadge}>
            <Ionicons name="checkmark" size={11} color={readableTextOn(theme.status.success)} />
          </View>
        ) : null}
        {cityCount > 1 ? (
          <View style={styles.cityCount}>
            <ThemedText variant="captionSmall" weight="700" style={styles.cityCountLabel}>
              +{cityCount} cities
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.meta}>
        <ThemedText variant="captionSmall" weight="700" numberOfLines={2} style={styles.title}>
          {title}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          tone="tertiary"
          numberOfLines={1}
          style={styles.subtitle}>
          {regionLabel}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  const officialAccent = theme.status.warning;
  const officialAccentFg = readableTextOn(officialAccent);

  return StyleSheet.create({
    section: {
      marginTop: Spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.screenPadding,
      marginBottom: Spacing.sm,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    officialBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: officialAccent,
    },
    officialBadgeLabel: {
      ...Typography.captionSmall,
      color: officialAccentFg,
      fontSize: 10,
      letterSpacing: 0.3,
    },
    seeAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    rail: {
      paddingHorizontal: Spacing.screenPadding,
      gap: 12,
    },
    card: {
      width: 108,
    },
    posterWrap: {
      width: 108,
      height: 152,
      borderRadius: Radius.md,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: officialAccent,
      backgroundColor: theme.background.secondary,
      ...Shadow.subtle,
    },
    poster: {
      width: '100%',
      height: '100%',
    },
    posterPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    idChip: {
      position: 'absolute',
      top: 6,
      left: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: officialAccent,
    },
    idChipLabel: {
      ...Typography.captionSmall,
      color: officialAccentFg,
      fontSize: 10,
      letterSpacing: 0.2,
    },
    collectedBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: theme.status.success,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.background.primary,
    },
    cityCount: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: theme.background.secondary,
    },
    cityCountLabel: {
      ...Typography.captionSmall,
      color: theme.text.primary,
      fontSize: 9,
    },
    meta: {
      marginTop: 6,
    },
    title: {
      ...Typography.captionSmall,
      color: theme.text.primary,
      fontSize: 12,
      lineHeight: 14,
    },
    subtitle: {
      ...Typography.captionSmall,
      fontSize: 10,
      marginTop: 2,
    },
  });
}
