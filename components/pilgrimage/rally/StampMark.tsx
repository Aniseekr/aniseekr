import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed';
import { useTheme } from '@/context/ThemeContext';

/**
 * A rally stamp drawn from real data only: the stop's number in the published
 * route. Collected = an inked double-ring stamp pressed at a slight angle;
 * pending = the dashed outline of an empty stamp slot.
 */
export function StampMark({
  number,
  collected,
  accent,
  size,
  tilt = 0,
}: {
  number: number;
  collected: boolean;
  accent: string;
  size: number;
  /** Degrees; only applied when collected (a pressed stamp is never square). */
  tilt?: number;
}) {
  const { theme } = useTheme();
  const center = size / 2;
  const outer = center - 1.5;
  const inner = outer - Math.max(3, size * 0.1);
  return (
    <View
      style={[
        { width: size, height: size },
        collected && tilt !== 0 ? { transform: [{ rotate: `${tilt}deg` }] } : null,
      ]}>
      <Svg width={size} height={size}>
        {collected ? (
          <>
            <Circle
              cx={center}
              cy={center}
              r={outer}
              fill={`${accent}2E`}
              stroke={accent}
              strokeWidth={1.75}
            />
            <Circle
              cx={center}
              cy={center}
              r={inner}
              fill="none"
              stroke={accent}
              strokeWidth={0.75}
            />
          </>
        ) : (
          <Circle
            cx={center}
            cy={center}
            r={outer}
            fill="none"
            stroke={theme.text.tertiary}
            strokeWidth={1.25}
            strokeDasharray="3 3"
          />
        )}
      </Svg>
      <View style={styles.label} pointerEvents="none">
        <ThemedText
          variant={size >= 44 ? 'titleMedium' : 'captionSmall'}
          weight="800"
          style={{ color: collected ? accent : theme.text.tertiary }}>
          {number}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
