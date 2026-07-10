// ProximityCheckInBanner — foreground proximity check-in prompt (spec 3.5).
// Shown on the detail map when the live location lands within 100m of a
// not-yet-checked-in spot. No reusable slide-banner exists elsewhere in the
// pilgrimage UI to lift from (the camera toasts are camera-HUD-specific), so
// this is a minimal themed banner rather than a bespoke one-off `View`.

import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Shadow, Spacing } from '../../../constants/DesignSystem';
import { ThemedButton, ThemedSurface, ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { useT } from '../../../libs/i18n';
import { formatDistanceKm } from './_helpers';

const ENTER_MS = 220;

export interface ProximityCheckInBannerProps {
  spotName: string;
  distanceMeters: number;
  theme: ThemePalette;
  t: ReturnType<typeof useT>;
  onCheckIn: () => void;
  onDismiss: () => void;
}

export function ProximityCheckInBanner({
  spotName,
  distanceMeters,
  theme,
  t,
  onCheckIn,
  onDismiss,
}: ProximityCheckInBannerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: ENTER_MS });
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -12 }],
  }));

  const distanceLabel = useMemo(
    () => formatDistanceKm(distanceMeters / 1000),
    [distanceMeters]
  );

  return (
    <Animated.View style={[styles.wrap, animatedStyle]} pointerEvents="box-none">
      <ThemedSurface variant="elevated" radius={Radius.lg} padded style={[styles.surface, Shadow.medium]}>
        <View style={[styles.iconBadge, { backgroundColor: `${theme.accent}22` }]}>
          <Ionicons name="location" size={18} color={theme.accent} />
        </View>
        <View style={styles.body}>
          <ThemedText variant="bodyMedium" weight="700" numberOfLines={2}>
            {t('pilgrimage.detail.nearSpotPrompt', { name: spotName })}
          </ThemedText>
          {distanceLabel ? (
            <ThemedText variant="captionSmall" tone="secondary">
              {distanceLabel}
            </ThemedText>
          ) : null}
        </View>
        <ThemedButton
          label={t('pilgrimageUi.checkIn')}
          size="sm"
          onPress={onCheckIn}
          accessibilityLabel={t('pilgrimageUi.checkIn')}
        />
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={({ pressed }) => [styles.dismissBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="close" size={16} color={theme.text.tertiary} />
        </Pressable>
      </ThemedSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // No horizontal padding here — this renders inside the route's `topOverlay`
  // stack, which already applies screen-edge padding to every child.
  wrap: {},
  surface: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
