import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Spacing } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { PilgrimageSpot } from '../../../libs/services/pilgrimage/types';
import { ThemedButton, ThemedIconButton, ThemedText } from '../../themed';
import { formatDistanceKm, getSpotConfidenceLabel, getSpotGeo } from './_helpers';

export interface SelectedSpotCardProps {
  spot: PilgrimageSpot;
  distanceKm: number | null;
  themeColor: string;
  theme: ThemePalette;
  onClose: () => void;
  onOpenMaps: (spot: PilgrimageSpot) => void;
  onStartCamera: (spot: PilgrimageSpot) => void;
  onMenuOpen: (spotId: string) => void;
}

/**
 * The spot the user picked on the map or in the list, pinned to the top of the
 * sheet at every detent. It is the one place a spot's actions live, so picking
 * a pin never has to raise or scroll the sheet — the map stays visible and the
 * next step (directions / camera) is one tap away.
 */
function SelectedSpotCardImpl({
  spot,
  distanceKm,
  themeColor,
  theme,
  onClose,
  onOpenMaps,
  onStartCamera,
  onMenuOpen,
}: SelectedSpotCardProps) {
  const t = useT();
  const titles = getPilgrimageSpotTitles(spot);
  const scene = spot.scenes[0];
  const sceneLine = [
    scene ? [scene.episode, scene.time].filter(Boolean).join(' · ') : null,
    distanceKm === null ? null : formatDistanceKm(distanceKm),
  ]
    .filter(Boolean)
    .join(' · ');
  const detailLine = [spot.address || null, getSpotConfidenceLabel(t, spot.confidence)]
    .filter(Boolean)
    .join(' · ');
  const hasGeo = getSpotGeo(spot) !== null;

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      style={[styles.card, { borderBottomColor: theme.glassBorder }]}>
      <View style={styles.titleRow}>
        <View style={styles.titleCol}>
          <ThemedText variant="titleMedium" weight="700" numberOfLines={1}>
            {titles.primary}
          </ThemedText>
          {sceneLine ? (
            <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
              {sceneLine}
            </ThemedText>
          ) : null}
          {detailLine ? (
            <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
              {detailLine}
            </ThemedText>
          ) : null}
        </View>
        <ThemedIconButton
          variant="ghost"
          accessibilityLabel={t('common.close')}
          icon={(color) => <Ionicons name="close" size={20} color={color} />}
          onPress={onClose}
        />
      </View>
      <View style={styles.actions}>
        <View style={styles.actionFlex}>
          <ThemedButton
            label={t('pilgrimage.detail.directions')}
            variant="secondary"
            fullWidth
            disabled={!hasGeo}
            onPress={() => onOpenMaps(spot)}
          />
        </View>
        <View style={styles.actionFlex}>
          <ThemedButton
            label={t('pilgrimage.detail.cameraCompare')}
            fullWidth
            accent={themeColor}
            onPress={() => onStartCamera(spot)}
          />
        </View>
        <ThemedIconButton
          icon={(color) => <Ionicons name="ellipsis-horizontal" size={22} color={color} />}
          accessibilityLabel={t('pilgrimage.detail.moreSpotActions')}
          onPress={() => onMenuOpen(spot.id)}
        />
      </View>
    </Animated.View>
  );
}

export const SelectedSpotCard = memo(SelectedSpotCardImpl);

const styles = StyleSheet.create({
  card: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  titleCol: { flex: 1, minWidth: 0, gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  actionFlex: { flex: 1 },
});
