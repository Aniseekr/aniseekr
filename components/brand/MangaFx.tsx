import { memo, useMemo } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// Manga print effects for the v6 brand: 集中線 (focus lines) and 網點 (screentone).
// Pure decoration — geometry only, tinted by the caller from useTheme().

// Fixed low-discrepancy jitter so the lines look hand-drawn but never reshuffle.
const jitter = (i: number, k: number) => (((i + 1) * (0.6180339 + k * 0.1347)) % 1) - 0.5;

function focusLinesPath(count: number, inner: number) {
  const cx = 50;
  const cy = 50;
  const outer = 80;
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + jitter(i, 0) * (Math.PI / count);
    const half = (0.15 + (jitter(i, 1) + 0.5) * 0.4) * (Math.PI / count);
    const r0 = inner * (1 + (jitter(i, 2) + 0.5) * 0.45);
    const p = (ang: number, r: number) =>
      `${(cx + Math.cos(ang) * r).toFixed(2)} ${(cy + Math.sin(ang) * r).toFixed(2)}`;
    d += `M${p(a, r0)} L${p(a - half, outer)} L${p(a + half, outer)} Z `;
  }
  return d;
}

interface FocusLinesProps {
  color: string;
  opacity?: number;
  count?: number;
  /** Clear radius in the middle, as % of the shorter side. */
  inner?: number;
  style?: ViewStyle;
}

/** Radial speed lines that fill their parent (absolute), clear in the centre. */
export const FocusLines = memo(function FocusLines({
  color,
  opacity = 0.5,
  count = 72,
  inner = 26,
  style,
}: FocusLinesProps) {
  const d = useMemo(() => focusLinesPath(count, inner), [count, inner]);
  return (
    <Svg
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice">
      <Path d={d} fill={color} opacity={opacity} />
    </Svg>
  );
});

function tonePath(size: number, step: number, maxR: number) {
  const c = size / 2;
  let d = '';
  for (let y = step / 2; y < size; y += step) {
    // Offset every other row: classic 45° halftone grid.
    const shift = Math.round(y / step) % 2 ? step / 2 : 0;
    for (let x = step / 2 + shift; x < size; x += step) {
      const t = 1 - Math.hypot(x - c, y - c) / c;
      if (t <= 0.04) continue;
      const r = (maxR * t).toFixed(2);
      d += `M${(x - +r).toFixed(2)} ${y.toFixed(2)}a${r} ${r} 0 1 0 ${2 * +r} 0a${r} ${r} 0 1 0 ${-2 * +r} 0`;
    }
  }
  return d;
}

interface ScreentoneDiscProps {
  size: number;
  color: string;
  opacity?: number;
  /** Dot pitch in px. */
  step?: number;
  style?: ViewStyle;
}

/** A round halftone patch: dots are fattest at the centre and fade to nothing. */
export const ScreentoneDisc = memo(function ScreentoneDisc({
  size,
  color,
  opacity = 0.55,
  step = 9,
  style,
}: ScreentoneDiscProps) {
  const d = useMemo(() => tonePath(size, step, step * 0.42), [size, step]);
  return (
    <Svg pointerEvents="none" width={size} height={size} style={style}>
      <Path d={d} fill={color} opacity={opacity} />
    </Svg>
  );
});
