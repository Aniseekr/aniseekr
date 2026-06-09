// Compact circular progress ring for the alignment badge. Fills clockwise from
// the top and shifts red → orange → green so the user can judge framing at a
// glance (US-17) instead of parsing the numeric %. Score is a React prop (the
// HUD already re-renders on it), so no worklet is needed here.

import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { ThemePalette } from '../../../context/ThemeContext';

const SIZE = 24;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** Tier thresholds: green ≥ 80%, orange 50–79%, red < 50% (US-17). */
export function alignmentRingColor(progress: number, theme: ThemePalette): string {
  if (progress >= 0.8) return theme.status.success;
  if (progress >= 0.5) return theme.status.warning;
  return theme.status.error;
}

export interface AlignmentRingProps {
  /** 0..1 alignment score. Clamped internally. */
  progress: number;
  theme: ThemePalette;
  /** Faint track behind the progress arc. */
  trackColor: string;
}

function AlignmentRingImpl({ progress, theme, trackColor }: AlignmentRingProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const color = alignmentRingColor(clamped, theme);
  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={trackColor} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={color}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
    </View>
  );
}

export const AlignmentRing = memo(AlignmentRingImpl);
