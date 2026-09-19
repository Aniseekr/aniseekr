// SceneTile — a clean scene thumbnail with its metadata below the image.
// Memo'd so one visited / saved / planned update does not re-render the grid.

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';

import { Radius, Size, Spacing } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { anitabiImageSource } from '../../../libs/services/pilgrimage/anitabi-image';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { ON_DARK, ThemedText } from '../../themed';
import { AnitabiOriginCredit } from '../common/AnitabiOriginCredit';
import { formatDistanceKm, getPointSourceLabel } from './_helpers';
import { sceneTilePropsEqual } from './_equality';

export interface SceneTileProps {
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
  onTakeComparison: (spot: AnitabiPoint) => void;
}

function SceneTileImpl({
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
  onTakeComparison,
}: SceneTileProps) {
  const t = useT();
  const styles = useMemo(() => makeTileStyles(theme), [theme]);
  const titles = getPilgrimageSpotTitles(spot);
  const sourceLabel = getPointSourceLabel(spot);
  const primaryMeta =
    sceneCount > 1
      ? t('pilgrimageUi.scenesCount', { count: sceneCount })
      : spot.ep > 0
        ? t('pilgrimage.detail.episodeShort', { episode: spot.ep })
        : t('pilgrimage.detail.scene');
  const labelledMeta = sourceLabel ? `${sourceLabel} · ${primaryMeta}` : primaryMeta;
  const metaLine =
    distanceKm != null ? `${labelledMeta} · ${formatDistanceKm(distanceKm)}` : labelledMeta;
  const [showCapture, setShowCapture] = useState(false);
  const flipped = showCapture && !!captureUri;
  const displayedUri = flipped ? captureUri! : spot.image;

  const handleFlip = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    if (captureUri) {
      setShowCapture((current) => !current);
    } else {
      onTakeComparison(spot);
    }
  }, [captureUri, onTakeComparison, spot]);
  const handlePress = useCallback(() => onPress(spot), [onPress, spot]);
  const handleLongPress = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    onToggleVisited(spot);
  }, [onToggleVisited, spot]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={280}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.86 }]}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimage.detail.openSpotA11y', { title: titles.primary })}
      accessibilityHint={t('pilgrimage.detail.toggleVisitedHint')}>
      <View
        style={[
          styles.imageWrap,
          { borderColor: visited ? `${theme.status.success}88` : theme.glassBorder },
        ]}>
        <Image
          source={anitabiImageSource(displayedUri)}
          style={styles.image}
          contentFit="cover"
          transition={160}
        />
        <Pressable
          onPress={handleFlip}
          hitSlop={4}
          style={({ pressed }) => [
            styles.flipButton,
            { backgroundColor: flipped ? `${themeColor}F2` : 'rgba(0,0,0,0.62)' },
            pressed && { opacity: 0.74 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            captureUri
              ? t(
                  flipped
                    ? 'pilgrimage.detail.showSceneImageA11y'
                    : 'pilgrimage.detail.showYourPhotoA11y'
                )
              : t('pilgrimageUi.takeComparisonPhoto')
          }>
          <Ionicons
            name={captureUri ? 'swap-horizontal' : 'camera-outline'}
            size={17}
            color={flipped ? themeColorFg : ON_DARK}
          />
        </Pressable>
      </View>

      <View style={styles.tileBody}>
        <ThemedText variant="bodySmall" weight="700" numberOfLines={1}>
          {titles.primary}
        </ThemedText>
        <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
          {metaLine}
        </ThemedText>
        <View style={styles.footerRow}>
          {flipped ? (
            <View style={styles.creditSpacer} />
          ) : (
            <AnitabiOriginCredit
              source={spot}
              variant="inline"
              textVariant="captionSmall"
              color={theme.text.tertiary}
              style={styles.originCredit}
            />
          )}
          <View style={styles.statusRow}>
            {hasCapture ? <Ionicons name="camera" size={13} color={themeColor} /> : null}
            {planned ? <Ionicons name="flag" size={13} color={theme.status.warning} /> : null}
            {saved ? <Ionicons name="bookmark" size={13} color={theme.status.info} /> : null}
            {visited ? (
              <Ionicons name="checkmark-circle" size={14} color={theme.status.success} />
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export const SceneTile = memo(SceneTileImpl, sceneTilePropsEqual);

function makeTileStyles(theme: ThemePalette) {
  return StyleSheet.create({
    tile: {
      gap: Spacing.xs,
      paddingBottom: Spacing.xs,
    },
    imageWrap: {
      width: '100%',
      aspectRatio: 4 / 3,
      position: 'relative',
      overflow: 'hidden',
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: theme.background.tertiary,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    flipButton: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      width: Size.minTouchTarget,
      height: Size.minTouchTarget,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileBody: {
      minWidth: 0,
      paddingHorizontal: 2,
      gap: 2,
    },
    footerRow: {
      minHeight: 15,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.xxs,
    },
    creditSpacer: {
      flex: 1,
    },
    originCredit: {
      flex: 1,
      minWidth: 0,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 5,
    },
  });
}
