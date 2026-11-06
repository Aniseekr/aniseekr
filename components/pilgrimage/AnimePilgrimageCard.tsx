// Ported from japanwalker/components/AnimePilgrimageCard.tsx, then made
// theme-aware: surface / text / collected-state colours now come from
// useTheme(); the per-anime brand colour (anime.color) still drives the
// region badge, gradient tint and distance badge.

import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { readableTextOn } from '../themed/contrast';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { Radius, Shadow, Typography } from '../../constants/DesignSystem';
import { cityToColor } from '../../libs/services/pilgrimage/region-color';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeWorkTitles,
} from '../../libs/services/pilgrimage/pilgrimage-localization';
import type { PilgrimageWork } from '../../libs/services/pilgrimage/types';
import { SpotImage } from './SpotImage';
import { bangumiSubjectImageUrl } from '../../libs/clients/bangumi-client';
import { atlasClient, type AtlasCityLabel } from '../../libs/services/pilgrimage/atlas/atlas-client';
import { useT } from '../../libs/i18n';

export interface AnimePilgrimageCardProps {
  anime: PilgrimageWork;
  coverFallback?: string | null;
  /** Optional distance from the user, in kilometres. */
  distance?: number;
  /** Show a green check badge when this anime is in the user's collection. */
  inCollection?: boolean;
  /** Optional sub-label (e.g. "Watching · ep 3") rendered next to the city tag. */
  collectionLabel?: string;
  onPress?: (anime: PilgrimageWork) => void;
}

const styleCache = new WeakMap<ThemePalette, ReturnType<typeof makeStyles>>();

function getStyles(theme: ThemePalette): ReturnType<typeof makeStyles> {
  const cached = styleCache.get(theme);
  if (cached) return cached;
  const styles = makeStyles(theme);
  styleCache.set(theme, styles);
  return styles;
}

const formatDistance = (km: number): string => {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
};

export function AnimePilgrimageCard({
  anime,
  coverFallback,
  distance,
  inCollection,
  collectionLabel,
  onPress,
}: AnimePilgrimageCardProps) {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme);
  const municipalityCode = anime.cities[0] ?? null;
  const [cityLookup, setCityLookup] = useState<{
    municipalityCode: string;
    lookup: ReadonlyMap<string, AtlasCityLabel>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!municipalityCode) return;
    void atlasClient
      .cityLookup()
      .then((lookup) => {
        if (!cancelled) setCityLookup({ municipalityCode, lookup });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [municipalityCode]);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(anime);
  };

// Atlas provides the region; app theme colors drive the card accents.
  const themeColor = theme.accent;
  const region =
    municipalityCode && cityLookup?.municipalityCode === municipalityCode
      ? cityLookup.lookup.get(municipalityCode) ?? null
      : null;
  const regionLabel = region ? `${region.pref} ${region.name}` : null;
  const regionColor = region ? cityToColor(region.name, themeColor) : themeColor;
  const regionFg = readableTextOn(regionColor);
  const distanceFg = readableTextOn(themeColor);
  const successFg = readableTextOn(theme.status.success);
  const titles = getPilgrimageAnimeWorkTitles(anime);
  const subtitle = formatPilgrimageSubtitle(titles);
  const poster = anime.bgm?.[0] ? bangumiSubjectImageUrl(anime.bgm[0], 'common') : null;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        { borderColor: inCollection ? theme.status.success : `${themeColor}30` },
        inCollection && styles.cardInCollection,
      ]}>
      <View style={styles.imageContainer}>
        <SpotImage
          uri={poster ?? coverFallback}
          fallbackUri={poster ? coverFallback : null}
          style={styles.image}
          contentFit="cover"
        />
        <LinearGradient
          colors={['transparent', `${themeColor}40`, theme.background.secondary]}
          style={styles.imageGradient}
        />

        <View style={styles.topLeftStack} pointerEvents="none">
          {region && regionLabel ? (
            <View
              style={[
                styles.regionBadge,
                { backgroundColor: regionColor, borderColor: `${regionFg}33` },
              ]}>
              <Ionicons name="location-sharp" size={11} color={regionFg} />
              <Text style={[styles.regionText, { color: regionFg }]} numberOfLines={1}>
                {regionLabel}
              </Text>
            </View>
          ) : null}
          {distance !== undefined ? (
            <View style={[styles.distanceBadge, { backgroundColor: `${themeColor}E0` }]}>
              <Text style={[styles.distanceText, { color: distanceFg }]}>
                {formatDistance(distance)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.spotCountBadge}>
          <Text style={styles.spotCountText}>{t('tabs.pilgrimageHome.spotCount', { count: anime.n })}</Text>
        </View>

        {inCollection ? (
          <View style={styles.collectedBadge}>
            <Ionicons name="checkmark" size={11} color={successFg} />
            <Text style={[styles.collectedBadgeText, { color: successFg }]}>
              {collectionLabel || t('tabs.pilgrimageHome.myWorks')}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {titles.primary}
        </Text>

        {subtitle ? (
          <Text style={styles.titleCN} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}

        {anime.spots.length > 0 ? (
          <View style={styles.previewRow}>
            {anime.spots.slice(0, 3).map((spot) => (
              <View key={spot.id} style={styles.previewThumb}>
                <Text style={styles.title} numberOfLines={2}>{spot.name}</Text>
                <Text style={styles.title} numberOfLines={1}>
                  {spot.lat === null || spot.lon === null
                    ? t('pilgrimage.confidence.unverified')
                    : t(`pilgrimage.confidence.${spot.confidence}`)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.background.secondary,
      borderRadius: Radius.card,
      overflow: 'hidden',
      borderWidth: 1,
      ...Shadow.medium,
    },
    cardPressed: {
      transform: [{ scale: 0.98 }],
      opacity: 0.9,
    },
    cardInCollection: {
      borderWidth: 1.5,
    },
    collectedBadge: {
      position: 'absolute',
      bottom: 10,
      left: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: theme.status.success,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radius.sm,
    },
    collectedBadgeText: {
      ...Typography.badge,
      letterSpacing: 0.2,
    },
    imageContainer: {
      height: 120,
      position: 'relative',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    imageGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 60,
    },
    topLeftStack: {
      position: 'absolute',
      top: 10,
      left: 10,
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 6,
      maxWidth: '70%',
    },
    regionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radius.sm,
      borderWidth: 1,
      ...Shadow.subtle,
    },
    regionText: {
      ...Typography.captionSmall,
      fontWeight: '700',
      letterSpacing: 0.2,
      maxWidth: 140,
    },
    distanceBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radius.sm,
    },
    distanceText: {
      ...Typography.captionSmall,
      fontWeight: '700',
    },
    spotCountBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      backgroundColor: theme.background.secondary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    spotCountText: {
      color: theme.text.primary,
      ...Typography.captionSmall,
      fontWeight: '600',
    },
    content: {
      padding: 12,
    },
    title: {
      ...Typography.titleLarge,
      fontWeight: '700',
      color: theme.text.primary,
      marginBottom: 2,
    },
    titleCN: {
      ...Typography.caption,
      color: theme.text.secondary,
      marginBottom: 12,
    },
    previewRow: {
      flexDirection: 'row',
      gap: 6,
    },
    previewThumb: {
      borderRadius: Radius.sm,
      flex: 1,
      minHeight: 36,
      paddingHorizontal: 6,
      paddingVertical: 4,
      backgroundColor: theme.background.tertiary,
    },
  });
}
