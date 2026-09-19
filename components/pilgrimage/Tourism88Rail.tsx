// Horizontal rail for the Japanese Anime Tourism 88 selection on the
// pilgrimage hub. Sorted by AniList popularity descending; multi-city anime
// collapse to one card with compact region and city-count metadata.

import React, { useMemo, useState } from 'react';
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

import { Spacing, Radius, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { ThemedText } from '../themed';
import { useT, type TranslationKey } from '../../libs/i18n';
import { bangumiSubjectImageUrl } from '../../libs/clients/bangumi-client';
import type {
  AnimeTourism88Region,
  UniqueAnime88Entry,
} from '../../libs/services/pilgrimage/anime88-repository';

const REGION_LABEL_KEY: Record<AnimeTourism88Region, TranslationKey> = {
  hokkaido_tohoku: 'pilgrimage.regions.hokkaido_tohoku',
  kanto: 'pilgrimage.regions.kanto',
  tokyo: 'pilgrimage.regions.tokyo',
  chubu: 'pilgrimage.regions.chubu',
  kinki: 'pilgrimage.regions.kinki',
  chugoku_shikoku: 'pilgrimage.regions.chugoku_shikoku',
  kyushu_okinawa: 'pilgrimage.regions.kyushu_okinawa',
};

export interface Tourism88RailProps {
  entries: readonly UniqueAnime88Entry[];
  /** Bangumi ids the user already has in their collection. */
  collectionBangumiIds: ReadonlySet<number>;
  onPressEntry: (entry: UniqueAnime88Entry) => void;
  onSeeAll?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Tourism88Rail({
  entries,
  collectionBangumiIds,
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
          <ThemedText variant="titleMedium" weight="700">
            {t('pilgrimageUi.animeTourism88')}
          </ThemedText>
          <View style={styles.officialBadge}>
            <Ionicons name="checkmark-circle-outline" size={11} color={theme.status.warning} />
            <ThemedText variant="captionSmall" weight="800" style={styles.officialBadgeLabel}>
              {t('pilgrimage.tourism88.official')}
            </ThemedText>
          </View>
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
  onPress: () => void;
  theme: ThemePalette;
}

function Tourism88RailCard({ entry, inCollection, onPress, theme }: Tourism88RailCardProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const primaryEntry = entry.locations[0];
  const cityCount = entry.locations.length;
  const regionLabel = t(REGION_LABEL_KEY[primaryEntry.region]);
  const title = entry.titleEn || entry.titleJa;
  const posterUri = entry.posterUrl ?? bangumiSubjectImageUrl(entry.bangumiId);
  const [posterFailed, setPosterFailed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimage.tourism88.entryA11y', { title })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      <View style={styles.posterWrap}>
        {posterFailed ? (
          <View style={styles.posterPlaceholder}>
            <Ionicons name="image-outline" size={24} color={theme.text.tertiary} />
          </View>
        ) : (
          <Image
            source={{ uri: posterUri }}
            style={styles.poster}
            contentFit="cover"
            transition={180}
            cachePolicy="memory-disk"
            onError={() => setPosterFailed(true)}
          />
        )}
      </View>
      <View style={styles.meta}>
        <ThemedText variant="captionSmall" weight="700" numberOfLines={2} style={styles.title}>
          {title}
        </ThemedText>
        <View style={styles.metaLine}>
          {inCollection ? (
            <Ionicons name="checkmark-circle" size={12} color={theme.status.success} />
          ) : null}
          <ThemedText
            variant="captionSmall"
            tone="tertiary"
            numberOfLines={1}
            style={styles.subtitle}>
            #{primaryEntry.id} · {regionLabel}
            {cityCount > 1
              ? ` · ${t('pilgrimage.tourism88.moreCities', { count: cityCount })}`
              : ''}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  const officialAccent = theme.status.warning;

  return StyleSheet.create({
    section: {},
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    officialBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: `${officialAccent}12`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${officialAccent}55`,
    },
    officialBadgeLabel: {
      ...Typography.captionSmall,
      color: officialAccent,
      letterSpacing: 0.3,
    },
    seeAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    rail: {
      paddingRight: Spacing.xs,
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
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
    },
    poster: {
      width: '100%',
      height: '100%',
    },
    posterPlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.tertiary,
    },
    meta: {
      marginTop: 6,
    },
    title: {
      ...Typography.caption,
      color: theme.text.primary,
    },
    subtitle: {
      ...Typography.captionSmall,
      flexShrink: 1,
    },
    metaLine: {
      minHeight: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 2,
    },
  });
}
