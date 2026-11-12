// The moment an on-site stamp lands: a large stamp drops onto the screen,
// settles, and fades. Manual notes get no ceremony — only being there does.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { readableTextOn, ThemedText } from '@/components/themed';
import { Radius, Spacing } from '@/constants/DesignSystem';
import { Springs, StampPress } from '@/libs/animations/presets';
import { useT } from '@/libs/i18n';
import type { StampEvent } from '@/hooks/usePilgrimageInteractions';

import { formatStampDate } from './rally-format';
import { StampMark } from './StampMark';

const SIZE = 132;

export function StampPressOverlay({ event, accent }: { event: StampEvent | null; accent: string }) {
  const t = useT();
  const opacity = useSharedValue(0);
  const scale = useSharedValue<number>(StampPress.fromScale);
  const key = event?.onsite ? event.key : null;

  useEffect(() => {
    if (key === null) return;
    scale.value = StampPress.fromScale;
    scale.value = withSpring(1, Springs.stamp);
    opacity.value = withSequence(
      withTiming(1, { duration: 90 }),
      withDelay(StampPress.holdMs, withTiming(0, { duration: StampPress.fadeMs }))
    );
  }, [key, opacity, scale]);

  const stampStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${StampPress.tiltDeg}deg` }],
  }));
  const captionStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!event?.onsite) return null;
  const caption = event.upgraded
    ? t('pilgrimage.stamps.upgraded')
    : event.count > 1
      ? t('pilgrimage.stamps.stampedMany', { count: event.count })
      : t('pilgrimage.stamps.stamped');

  return (
    <View style={styles.fill} pointerEvents="none" accessibilityLiveRegion="polite">
      <Animated.View style={stampStyle}>
        <StampMark number={formatStampDate(event.key)} collected accent={accent} size={SIZE} />
      </Animated.View>
      <Animated.View style={[styles.caption, { backgroundColor: accent }, captionStyle]}>
        <ThemedText variant="bodySmall" weight="800" style={{ color: readableTextOn(accent) }}>
          {caption}
        </ThemedText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  caption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
});
