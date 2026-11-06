import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Mask, Pattern, Rect, Stop } from 'react-native-svg';

/**
 * Print-style dot screen (網點) that fades out along a diagonal. Purely
 * decorative: sits behind content with pointerEvents off.
 */
export function Halftone({
  color,
  spacing = 9,
  radius = 1.6,
  opacity = 0.5,
}: {
  color: string;
  spacing?: number;
  radius?: number;
  opacity?: number;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern
          id={`dots${id}`}
          patternUnits="userSpaceOnUse"
          width={spacing}
          height={spacing}>
          <Circle cx={spacing / 2} cy={spacing / 2} r={radius} fill={color} />
        </Pattern>
        <LinearGradient id={`fade${id}`} x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="white" stopOpacity={opacity} />
          <Stop offset="0.7" stopColor="white" stopOpacity={0} />
        </LinearGradient>
        <Mask id={`mask${id}`}>
          <Rect width="100%" height="100%" fill={`url(#fade${id})`} />
        </Mask>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#dots${id})`} mask={`url(#mask${id})`} />
    </Svg>
  );
}
