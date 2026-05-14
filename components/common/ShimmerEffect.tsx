import { memo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  makeMutable,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Radius } from '../../constants/DesignSystem';

interface ShimmerEffectProps {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  borderRadius?: number;
  style?: ViewStyle;
  duration?: number;
  intensity?: 'low' | 'medium' | 'high';
}

const INTENSITY: Record<'low' | 'medium' | 'high', { base: number; peak: number }> = {
  low: { base: 0.04, peak: 0.10 },
  medium: { base: 0.06, peak: 0.18 },
  high: { base: 0.10, peak: 0.28 },
};

// One shared driver for every ShimmerEffect mounted anywhere in the app.
// Why: the previous design created a `useSharedValue` + `withRepeat` + a
// `LinearGradient` native view per instance. A single skeleton page (e.g.
// Skeleton.HeroDetail with showEpisodes) mounts ~25 instances — that's 25
// concurrent UI-thread animation workers and 25 gradient layers being
// re-composited every frame, which is what made the home Trend rail and the
// anime detail navigation feel laggy. A module-level shared value costs the
// same regardless of how many `useAnimatedStyle` subscribers read it.
const shimmerProgress = makeMutable(0);
shimmerProgress.value = withRepeat(
  withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
  -1,
  true,
);

function ShimmerEffectComponent({
  width = '100%',
  height = 16,
  borderRadius = Radius.sm,
  style,
  intensity = 'medium',
}: ShimmerEffectProps) {
  const { base, peak } = INTENSITY[intensity];
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: base + (peak - base) * shimmerProgress.value,
  }));

  return (
    <View
      style={[
        styles.container,
        { width: width as any, height: height as any, borderRadius },
        style,
      ]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.fill, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: '#FFFFFF',
  },
});

export const ShimmerEffect = memo(ShimmerEffectComponent);
