import type { ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';

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
  miniStamp: {
    borderRadius: Radius.full,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
