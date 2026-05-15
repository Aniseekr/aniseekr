import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { readableTextOn, ThemedText } from '../../themed';
import type { FocusPoint } from './types';

interface FocusReticleProps {
  focusPoint: FocusPoint | null;
  accent: string; // border + cross color — caller decides (e.g. themeColor)
  afLocked?: boolean; // when true, show "AF LOCK" badge under the ring
}

const SIZE = 56;
const CROSS_LENGTH = 12;
const ANIM_MS = 200;
const START_SCALE = 1.4;
const BADGE_WIDTH = 64;
const BADGE_HEIGHT = 22;
const BADGE_GAP = 8;

export function FocusReticle({ focusPoint, accent, afLocked = false }: FocusReticleProps) {
  // No focus point AND not locked => render nothing. Never a "default"
  // reticle at screen center (Rule 8: no permanent ring that pretends to
  // know where focus is).
  if (!focusPoint) return null;
  // Key on createdAt so each tap remounts the animated child and gets a fresh
  // grow-in animation. Old instances are GC'd by React.
  return (
    <FocusReticleAnimated
      key={focusPoint.createdAt}
      focusPoint={focusPoint}
      accent={accent}
      afLocked={afLocked}
    />
  );
}

function FocusReticleAnimated({
  focusPoint,
  accent,
  afLocked,
}: {
  focusPoint: FocusPoint;
  accent: string;
  afLocked: boolean;
}) {
  const scale = useSharedValue(START_SCALE);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, { duration: ANIM_MS });
    opacity.value = withTiming(1, { duration: ANIM_MS });
  }, [scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const badgeFg = readableTextOn(accent);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        animatedStyle,
        {
          left: focusPoint.x - SIZE / 2,
          top: focusPoint.y - SIZE / 2,
        },
      ]}>
      <View style={[styles.ring, { borderColor: accent }]}>
        <View style={[styles.crossV, { backgroundColor: accent }]} />
        <View style={[styles.crossH, { backgroundColor: accent }]} />
      </View>
      {afLocked ? (
        <View style={[styles.badge, { backgroundColor: accent, left: (SIZE - BADGE_WIDTH) / 2 }]}>
          <ThemedText variant="captionSmall" weight="700" align="center" style={{ color: badgeFg }}>
            AF LOCK
          </ThemedText>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: SIZE,
    // Height is just the ring — badge is absolutely positioned below so it
    // doesn't push the ring off-center when present.
    height: SIZE,
  },
  ring: {
    width: SIZE,
    height: SIZE,
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crossV: {
    position: 'absolute',
    width: 1,
    height: CROSS_LENGTH,
  },
  crossH: {
    position: 'absolute',
    width: CROSS_LENGTH,
    height: 1,
  },
  badge: {
    position: 'absolute',
    top: SIZE + BADGE_GAP,
    width: BADGE_WIDTH,
    height: BADGE_HEIGHT,
    borderRadius: BADGE_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
