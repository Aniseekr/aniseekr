import { StyleSheet } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../../../context/ThemeContext';

interface LevelHorizonProps {
  tiltShared: SharedValue<number>;
  color: string;
  levelTolerance?: number;
  width?: number;
}

// ~1.5° in radians; within this window we consider the camera "level".
const DEFAULT_TOLERANCE = 0.026;

export function LevelHorizon({
  tiltShared,
  color,
  levelTolerance = DEFAULT_TOLERANCE,
  width = 240,
}: LevelHorizonProps) {
  const { theme } = useTheme();
  const successColor = theme.status?.success ?? '#00C853';

  // Worklet: reads tiltShared on the UI thread every frame so the line
  // tracks the sensor without round-tripping through JS.
  const animatedStyle = useAnimatedStyle(() => {
    const tilt = tiltShared.value;
    const abs = Math.abs(tilt);
    const opacity = interpolate(
      abs,
      [0, levelTolerance, levelTolerance * 4],
      [1, 1, 0.25],
      Extrapolation.CLAMP
    );
    const backgroundColor = interpolateColor(
      abs,
      [0, levelTolerance],
      [successColor, color]
    );
    return {
      opacity,
      backgroundColor,
      transform: [{ rotate: `${-tilt}rad` }],
    };
  });

  return <Animated.View style={[{ width, height: StyleSheet.hairlineWidth }, animatedStyle]} />;
}
