import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed';
import { useTheme } from '@/context/ThemeContext';

/**
 * A stamp drawn from real data only: the stop's number in the published
 * route, or a spot's episode. Collected = an inked double-ring stamp pressed
 * at a slight angle; `manual` (a note made away from the spot) = one thin
 * ring, no ink; pending = the dashed outline of an empty stamp slot.
 */
export function StampMark({
  number,
  collected,
  manual = false,
  accent,
  size,
  tilt = 0,
}: {
  number: number | string;
  collected: boolean;
  /** Collected without proof of being there; drawn lighter than an on-site stamp. */
  manual?: boolean;
  accent: string;
  size: number;
  /** Degrees; only applied when collected (a pressed stamp is never square). */
  tilt?: number;
}) {
  const { theme } = useTheme();
  const center = size / 2;
  const outer = center - 1.5;
  const inner = outer - Math.max(3, size * 0.1);
  const ink = collected ? (manual ? `${accent}99` : accent) : theme.text.tertiary;
  return (
    <View
      style={[
        { width: size, height: size },
        collected && tilt !== 0 ? { transform: [{ rotate: `${tilt}deg` }] } : null,
      ]}>
      <Svg width={size} height={size}>
        {collected && manual ? (
          <Circle cx={center} cy={center} r={outer} fill="none" stroke={ink} strokeWidth={1.25} />
        ) : collected ? (
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
          variant={size >= 44 && String(number).length <= 2 ? 'titleMedium' : 'captionSmall'}
          weight="800"
          numberOfLines={1}
          style={{ color: ink }}>
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
