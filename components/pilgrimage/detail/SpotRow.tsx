import React, { memo, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Radius, Spacing } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { spotRowLayout } from '../../../libs/animations/presets';
import { anitabiImageSource } from '../../../libs/services/pilgrimage/anitabi-image';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { AnitabiPoint, AnitabiSpot } from '../../../libs/services/pilgrimage/types';
import { ThemedButton, ThemedIconButton, ThemedText } from '../../themed';
import { formatDistanceKm, hasValidGeo } from './_helpers';

export interface SpotRowProps {
  group: AnitabiSpot;
  spot: AnitabiPoint;
  index: number;
  selected: boolean;
  themeColor: string;
  distanceKm: number | null;
  visited: boolean;
  theme: ThemePalette;
  onPress: (group: AnitabiSpot) => void;
  onToggleVisited: (group: AnitabiSpot) => void;
  onOpenMaps: (spot: AnitabiPoint) => void;
  onStartCamera: (spot: AnitabiPoint) => void;
  onMenuOpen: (spotId: string) => void;
}

function SpotRowImpl({
  group,
  spot,
  index,
  selected,
  themeColor,
  distanceKm,
  visited,
  theme,
  onPress,
  onToggleVisited,
  onOpenMaps,
  onStartCamera,
  onMenuOpen,
}: SpotRowProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const titles = getPilgrimageSpotTitles(spot);
  const subtitle = [
    spot.ep > 0 ? t('pilgrimage.detail.episodeShort', { episode: spot.ep }) : null,
    distanceKm === null ? null : formatDistanceKm(distanceKm),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View layout={spotRowLayout()} style={styles.container}>
      <View style={styles.row}>
        <Pressable
          onPress={() => onPress(group)}
          accessibilityRole="button"
          accessibilityState={{ expanded: selected }}
          accessibilityLabel={t('pilgrimage.detail.openSpotA11y', { title: titles.primary })}
          style={styles.rowBody}>
          <View style={styles.thumbnail}>
            <Image
              source={anitabiImageSource(spot.image)}
              style={styles.image}
              contentFit="cover"
            />
          </View>
          <View style={styles.info}>
            <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
              {t('pilgrimage.detail.spotNumber', { index: index + 1 })} · {titles.primary}
            </ThemedText>
            {subtitle ? (
              <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
        <ThemedIconButton
          variant="ghost"
          haptic="none"
          icon={() => (
            <Ionicons
              name={visited ? 'checkmark-circle' : 'ellipse-outline'}
              size={25}
              color={visited ? themeColor : theme.text.tertiary}
            />
          )}
          accessibilityLabel={t(
            visited ? 'pilgrimage.detail.markNotVisitedA11y' : 'pilgrimage.detail.markVisitedA11y'
          )}
          onPress={() => onToggleVisited(group)}
        />
      </View>

      {selected ? (
        <View style={styles.expanded}>
          {group.scenes.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scenes}>
              {group.scenes.map((scene) => (
                <View key={scene.id} style={styles.sceneThumb}>
                  <Image
                    source={anitabiImageSource(scene.image)}
                    style={styles.image}
                    contentFit="cover"
                  />
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.actions}>
            <View style={styles.actionFlex}>
              <ThemedButton
                label={t('pilgrimage.detail.directions')}
                variant="secondary"
                size="md"
                fullWidth
                disabled={!hasValidGeo(spot.geo)}
                onPress={() => onOpenMaps(spot)}
              />
            </View>
            <View style={styles.actionFlex}>
              <ThemedButton
                label={t('pilgrimage.detail.cameraCompare')}
                size="md"
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
        </View>
      ) : null}
    </Animated.View>
  );
}

export const SpotRow = memo(SpotRowImpl);

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.glassBorder,
      paddingVertical: Spacing.xs,
    },
    row: { flexDirection: 'row', alignItems: 'center' },
    rowBody: {
      flex: 1,
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    thumbnail: {
      width: 96,
      height: 54,
      borderRadius: Radius.md,
      overflow: 'hidden',
      backgroundColor: theme.background.tertiary,
    },
    image: { width: '100%', height: '100%' },
    info: { flex: 1, minWidth: 0, gap: 3 },
    expanded: { gap: Spacing.sm, paddingTop: Spacing.xs, paddingBottom: Spacing.sm },
    scenes: { gap: Spacing.xs },
    sceneThumb: {
      width: 96,
      height: 54,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      backgroundColor: theme.background.tertiary,
    },
    actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    actionFlex: { flex: 1 },
  });
}
