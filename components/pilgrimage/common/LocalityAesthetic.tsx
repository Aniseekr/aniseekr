import type { ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { IconSize, Radius, Size, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import type { EventCategory } from '../../../libs/services/pilgrimage/locality/types';
import { anitabiImageSource } from '../../../libs/services/pilgrimage/anitabi-image';
export {
  localityEventAccent,
  localityMarkerPalette,
  type LocalityMarkerPalette,
} from './locality-aesthetic';

export const LOCALITY_CARD_RADIUS = Radius.cardLg;
export const LOCALITY_INNER_RADIUS = Radius.md;

export function localityCategoryIcon(
  category: EventCategory
): ComponentProps<typeof Ionicons>['name'] {
  if (category === 'stamp_rally') return 'ticket-outline';
  if (category === 'festival') return 'sparkles-outline';
  if (category === 'collab_cafe') return 'cafe-outline';
  if (category === 'exhibition') return 'easel-outline';
  return 'calendar-outline';
}

export function LocalityCardDecor({
  accent,
  tape = 'right',
  gradient = true,
}: {
  accent: string;
  tape?: 'none' | 'left' | 'center' | 'right';
  gradient?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <>
      {gradient ? (
        <LinearGradient
          colors={theme.gradient}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.gradient]}
        />
      ) : null}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.corner, styles.cornerTopLeft, { borderColor: accent }]} />
        <View style={[styles.corner, styles.cornerBottomRight, { borderColor: accent }]} />
      </View>
      {tape !== 'none' ? (
        <View
          pointerEvents="none"
          style={[
            styles.washiTape,
            tape === 'left'
              ? styles.tapeLeft
              : tape === 'center'
                ? styles.tapeCenter
                : styles.tapeRight,
            { backgroundColor: accent },
          ]}
        />
      ) : null}
    </>
  );
}

export function LocalityMiniStamp({
  accent,
  imageUri,
  icon = 'sparkles-outline',
  size = 'md',
  style,
}: {
  accent: string;
  imageUri?: string | null;
  icon?: ComponentProps<typeof Ionicons>['name'];
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const dimension = size === 'sm' ? Spacing.lg : Size.avatarMedium;
  const iconSize = size === 'sm' ? Spacing.sm : IconSize.sm;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.miniStamp,
        {
          width: dimension,
          height: dimension,
          backgroundColor: theme.background.secondary,
          borderColor: accent,
        },
        style,
      ]}>
      {imageUri ? (
        <Image
          source={anitabiImageSource(imageUri)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        <Ionicons name={icon} size={iconSize} color={accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { opacity: 0.14 },
  corner: {
    position: 'absolute',
    width: Spacing.lg,
    height: Spacing.lg,
    opacity: 0.42,
  },
  cornerTopLeft: {
    top: Spacing.xs,
    left: Spacing.xs,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopLeftRadius: Radius.sm,
  },
  cornerBottomRight: {
    right: Spacing.xs,
    bottom: Spacing.xs,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderBottomRightRadius: Radius.sm,
  },
  washiTape: {
    position: 'absolute',
    top: Spacing.xs,
    width: Size.avatarLarge,
    height: Spacing.xs,
    borderRadius: Radius.sm,
    opacity: 0.48,
  },
  tapeLeft: { left: Spacing.xl, transform: [{ rotate: '-2deg' }] },
  tapeCenter: { alignSelf: 'center', transform: [{ rotate: '1deg' }] },
  tapeRight: { right: Spacing.xl, transform: [{ rotate: '-1deg' }] },
  miniStamp: {
    borderRadius: Radius.full,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
