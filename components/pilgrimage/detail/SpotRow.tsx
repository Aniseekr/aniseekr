// SpotRow — compact list presentation for one pilgrimage spot. The row keeps
// capture/reference comparison, visit state, intents and directions without
// wrapping each location in another oversized card.

import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radius, Size, Spacing } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { anitabiImageSource } from '../../../libs/services/pilgrimage/anitabi-image';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { ON_DARK, ThemedText } from '../../themed';
import { formatDistanceKm, getPointSourceLabel, hasValidGeo } from './_helpers';
import { spotRowPropsEqual } from './_equality';

export interface SpotRowProps {
  spot: AnitabiPoint;
  sceneCount: number;
  themeColor: string;
  themeColorFg: string;
  distanceKm: number | null;
  visited: boolean;
  saved: boolean;
  planned: boolean;
  hasCapture: boolean;
  captureUri: string | null;
  theme: ThemePalette;
  onPress: (spot: AnitabiPoint) => void;
  onToggleVisited: (spot: AnitabiPoint) => void;
  onOpenMaps: (spot: AnitabiPoint) => void;
}

function SpotRowImpl({
  spot,
  sceneCount,
  themeColor,
  themeColorFg,
  distanceKm,
  visited,
  saved,
  planned,
  hasCapture,
  captureUri,
  theme,
  onPress,
  onToggleVisited,
  onOpenMaps,
}: SpotRowProps) {
  const t = useT();
  const styles = useMemo(() => makeRowStyles(theme), [theme]);
  const hasGeo = hasValidGeo(spot.geo);
  const titles = getPilgrimageSpotTitles(spot);
  const sourceLabel = getPointSourceLabel(spot);
  const sceneMeta =
    sceneCount > 1
      ? t('pilgrimageUi.scenesCount', { count: sceneCount })
      : spot.ep > 0
        ? t('pilgrimage.detail.episodeShort', { episode: spot.ep })
        : t('pilgrimage.detail.scene');
  const metaLabel = sourceLabel ? `${sourceLabel} · ${sceneMeta}` : sceneMeta;
  const handlePress = useCallback(() => onPress(spot), [onPress, spot]);
  const handleToggleVisited = useCallback(() => onToggleVisited(spot), [onToggleVisited, spot]);
  const handleOpenMaps = useCallback(() => onOpenMaps(spot), [onOpenMaps, spot]);
  const showSplit = !!captureUri;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.84 }]}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimage.detail.openSpotA11y', { title: titles.primary })}>
      <View
        style={[
          styles.thumbnail,
          { borderColor: visited ? `${theme.status.success}88` : theme.glassBorder },
        ]}>
        {showSplit ? (
          <>
            <View style={styles.imageHalf}>
              <Image
                source={{ uri: captureUri }}
                style={styles.image}
                contentFit="cover"
                transition={150}
              />
              <ThemedText variant="captionSmall" weight="800" style={styles.realLabel}>
                {t('pilgrimageUi.real')}
              </ThemedText>
            </View>
            <View style={styles.splitDivider} />
            <View style={styles.imageHalf}>
              <Image
                source={anitabiImageSource(spot.image)}
                style={styles.image}
                contentFit="cover"
                transition={150}
              />
              <ThemedText
                variant="captionSmall"
                weight="800"
                style={[
                  styles.animeLabel,
                  { backgroundColor: `${themeColor}E6`, color: themeColorFg },
                ]}>
                {t('pilgrimageUi.anime')}
              </ThemedText>
            </View>
          </>
        ) : (
          <Image
            source={anitabiImageSource(spot.image)}
            style={styles.image}
            contentFit="cover"
            transition={150}
          />
        )}
      </View>

      <View style={styles.infoColumn}>
        <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
          {titles.primary}
        </ThemedText>
        <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={2}>
          {metaLabel}
          {titles.secondary ? ` · ${titles.secondary}` : ''}
        </ThemedText>
        <View style={styles.metaFooter}>
          {distanceKm != null ? (
            <ThemedText variant="captionSmall" weight="700" style={{ color: themeColor }}>
              {formatDistanceKm(distanceKm)}
            </ThemedText>
          ) : null}
          <View style={styles.intentRow}>
            {hasCapture ? <Ionicons name="camera" size={13} color={themeColor} /> : null}
            {planned ? <Ionicons name="flag" size={13} color={theme.status.warning} /> : null}
            {saved ? <Ionicons name="bookmark" size={13} color={theme.status.info} /> : null}
          </View>
        </View>
      </View>

      <View style={styles.actionsColumn}>
        <Pressable
          onPress={handleToggleVisited}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: visited }}
          accessibilityLabel={t(
            visited ? 'pilgrimage.detail.markNotVisitedA11y' : 'pilgrimage.detail.markVisitedA11y'
          )}
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.65 }]}>
          <Ionicons
            name={visited ? 'checkmark-circle' : 'ellipse-outline'}
            size={21}
            color={visited ? theme.status.success : theme.text.tertiary}
          />
        </Pressable>
        <Pressable
          onPress={handleOpenMaps}
          disabled={!hasGeo}
          accessibilityRole="button"
          accessibilityLabel={t('pilgrimage.detail.directionsA11y', { title: titles.primary })}
          style={({ pressed }) => [
            styles.iconButton,
            !hasGeo && { opacity: 0.35 },
            pressed && hasGeo && { opacity: 0.65 },
          ]}>
          <MaterialIcons
            name="directions"
            size={20}
            color={hasGeo ? theme.status.info : theme.text.tertiary}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

export const SpotRow = memo(SpotRowImpl, spotRowPropsEqual);

function makeRowStyles(theme: ThemePalette) {
  return StyleSheet.create({
    row: {
      minHeight: 104,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.glassBorder,
    },
    thumbnail: {
      width: 112,
      height: 80,
      flexDirection: 'row',
      overflow: 'hidden',
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: theme.background.tertiary,
    },
    imageHalf: {
      flex: 1,
      position: 'relative',
    },
    splitDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: ON_DARK,
      opacity: 0.7,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    realLabel: {
      position: 'absolute',
      left: 4,
      bottom: 4,
      color: ON_DARK,
      backgroundColor: 'rgba(0,0,0,0.68)',
      paddingHorizontal: 4,
      borderRadius: 4,
      textTransform: 'uppercase',
    },
    animeLabel: {
      position: 'absolute',
      left: 4,
      bottom: 4,
      paddingHorizontal: 4,
      borderRadius: 4,
      textTransform: 'uppercase',
    },
    infoColumn: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    metaFooter: {
      minHeight: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.xs,
    },
    intentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    actionsColumn: {
      alignItems: 'center',
    },
    iconButton: {
      width: Size.minTouchTarget,
      height: Size.minTouchTarget,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
