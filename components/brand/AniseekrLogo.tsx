import { memo, useCallback, useEffect } from 'react';
import { Pressable, type GestureResponderEvent, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';
import { SEEKR_COLORS, useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import brand from './brand.json';

// The v6 lockup from aniseekr.moe: Seekr's head, then ANIS◉◉KR where the two
// E's are eyes. The eyes glance at a tap, everything blinks now and then, and a
// tap stamps the mark in like a manga sound effect. Reduced motion: still.

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

const W = brand.word;
const HEAD_W = 88;
const WORD_X = HEAD_W + 8;
const WORD_Y = 5;
const VIEW_H = 90;
// Head art sits at scale 1.1, offset (-15.4, 2.8); its eye centre is (50, 51).
const HEAD_SCALE = 1.1;
const HEAD_DX = -15.4;
const HEAD_DY = 2.8;
const HEAD_EYE = { x: 50, y: 51, iris: 8.6, hole: 5, shine: 2, shineDx: -2.6, shineDy: -2.8 };
const WORD_PUPIL = 12;
const WORD_IRIS = 22;
const WORD_SHINE = 4;

// Idle blink: shut for ~170 ms every ~3.6 s, forever.
function blinkLoop() {
  return withDelay(
    1600,
    withRepeat(
      withSequence(
        withTiming(0.08, { duration: 85, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 85, easing: Easing.inOut(Easing.quad) }),
        withDelay(3400, withTiming(1, { duration: 0 }))
      ),
      -1
    )
  );
}

/** lockup = head + wordmark, mark = head only, word = ANIS◉◉KR only. */
export type AniseekrLogoVariant = 'lockup' | 'mark' | 'word';

interface AniseekrLogoProps {
  height?: number;
  variant?: AniseekrLogoVariant;
  /** Tap → stamp + glance. Off for purely decorative placements. */
  interactive?: boolean;
  /** Stamp in once on mount (launch screen). */
  stampOnMount?: boolean;
  style?: ViewStyle;
}

// [minX, minY, width, height]. The mark alone uses the same crop as the
// landing's mark.svg (head space 14 2 80 76), which is also the native splash.
function viewBox(variant: AniseekrLogoVariant): [number, number, number, number] {
  if (variant === 'mark') return [0, 5, 88, 83.6];
  if (variant === 'word') return [WORD_X - 4, 0, W.width + 8, VIEW_H];
  return [0, 0, WORD_X + W.width + 4, VIEW_H];
}

function AniseekrLogoComponent({
  height = 36,
  variant = 'lockup',
  interactive = true,
  stampOnMount = false,
  style,
}: AniseekrLogoProps) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const vb = viewBox(variant);
  const width = (height * vb[2]) / vb[3];

  const lid = useSharedValue(1);
  const lookX = useSharedValue(0);
  const lookY = useSharedValue(0);
  const scale = useSharedValue(stampOnMount && !reduced ? 0 : 1);
  const rotate = useSharedValue(0);
  const hop = useSharedValue(0);

  const stamp = useCallback(() => {
    scale.value = withSequence(
      withTiming(1.35, { duration: 0 }),
      withSpring(1, { damping: 7, stiffness: 260 })
    );
    rotate.value = withSequence(withTiming(-6, { duration: 0 }), withSpring(0, { damping: 9 }));
  }, [rotate, scale]);

  useEffect(() => {
    if (reduced) return;
    if (stampOnMount) {
      scale.value = withDelay(
        180,
        withSequence(
          withTiming(1.35, { duration: 120, easing: Easing.out(Easing.cubic) }),
          withSpring(1, { damping: 7, stiffness: 260 })
        )
      );
      rotate.value = withDelay(
        180,
        withSequence(withTiming(-6, { duration: 120 }), withSpring(0, { damping: 9 }))
      );
    }
    lid.value = blinkLoop();
  }, [lid, reduced, rotate, scale, stampOnMount]);

  const onPressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (reduced) return;
      // Glance toward the finger, then drift back to centre.
      const { locationX, locationY } = e.nativeEvent;
      const s = height / vb[3];
      const eyeX =
        variant !== 'mark'
          ? (WORD_X + (W.eyes[0] + W.eyes[1]) / 2 - vb[0]) * s
          : (HEAD_EYE.x * HEAD_SCALE + HEAD_DX - vb[0]) * s;
      const eyeY =
        variant !== 'mark'
          ? (WORD_Y + W.eyeY) * s
          : (HEAD_EYE.y * HEAD_SCALE + HEAD_DY - vb[1]) * s;
      const dx = locationX - eyeX;
      const dy = locationY - eyeY;
      const d = Math.hypot(dx, dy) || 1;
      lookX.value = withSequence(
        withTiming(dx / d, { duration: 90 }),
        withDelay(700, withSpring(0))
      );
      lookY.value = withSequence(
        withTiming(dy / d, { duration: 90 }),
        withDelay(700, withSpring(0))
      );
    },
    [height, lookX, lookY, reduced, variant, vb]
  );

  const onPress = useCallback(() => {
    hapticsBridge.tap();
    if (reduced) return;
    stamp();
    hop.value = withSequence(
      withTiming(-height * 0.18, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 8, stiffness: 300 })
    );
    // One quick blink, then back to the idle loop (assigning lid replaces it).
    lid.value = withSequence(
      withTiming(0.08, { duration: 70 }),
      withTiming(1, { duration: 90 }),
      blinkLoop()
    );
  }, [height, hop, lid, reduced, stamp]);

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: hop.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  const ink = theme.text.primary;
  const spot = theme.accent;

  const svg = (
    <Svg width={width} height={height} viewBox={vb.join(' ')}>
      <Defs>
        <ClipPath id="seekr-head">
          <Path d={brand.seekr.head} />
        </ClipPath>
        <ClipPath id="seekr-eye">
          <Path d={brand.seekr.eye} />
        </ClipPath>
      </Defs>
      {variant !== 'word' ? (
        <G transform={`translate(${HEAD_DX} ${HEAD_DY}) scale(${HEAD_SCALE})`}>
          {/* Stroke underneath, fill on top: SVG paint-order: stroke. */}
          <Path
            d={brand.seekr.head}
            fill={SEEKR_COLORS.body}
            stroke={ink}
            strokeWidth={3}
            strokeLinejoin="round"
          />
          <Path d={brand.seekr.head} fill={SEEKR_COLORS.body} />
          <Rect
            x={brand.band.x}
            y={brand.band.y}
            width={brand.band.w}
            height={brand.band.h}
            fill={SEEKR_COLORS.band}
            clipPath="url(#seekr-head)"
          />
          <Path d={brand.tails} fill={spot} stroke={ink} strokeWidth={1.2} strokeLinejoin="round" />
          <Path d={brand.seekr.eye} fill={SEEKR_COLORS.eye} />
          <G clipPath="url(#seekr-eye)">
            <HeadPupil lid={lid} lookX={lookX} lookY={lookY} />
          </G>
        </G>
      ) : null}
      {variant !== 'mark' ? (
        <G transform={`translate(${WORD_X} ${WORD_Y})`}>
          <Path d={W.anis} fill={ink} />
          {W.eyes.map((cx) => (
            <WordEye key={cx} cx={cx} ink={ink} lid={lid} lookX={lookX} lookY={lookY} />
          ))}
          <Path d={W.kr} fill={spot} />
        </G>
      ) : null}
    </Svg>
  );

  return (
    <Animated.View style={[{ width, height }, wrapStyle, style]}>
      {interactive ? (
        <Pressable
          onPressIn={onPressIn}
          onPress={onPress}
          accessibilityRole="image"
          accessibilityLabel="Aniseekr"
          hitSlop={8}>
          {svg}
        </Pressable>
      ) : (
        svg
      )}
    </Animated.View>
  );
}

interface EyeMotion {
  lid: SharedValue<number>;
  lookX: SharedValue<number>;
  lookY: SharedValue<number>;
}

function HeadPupil({ lid, lookX, lookY }: EyeMotion) {
  const reach = 6;
  const iris = useAnimatedProps(() => ({
    cx: HEAD_EYE.x + lookX.value * reach,
    cy: HEAD_EYE.y + lookY.value * reach * 0.4,
    ry: HEAD_EYE.iris * lid.value,
  }));
  const hole = useAnimatedProps(() => ({
    cx: HEAD_EYE.x + lookX.value * reach,
    cy: HEAD_EYE.y + lookY.value * reach * 0.4,
    ry: HEAD_EYE.hole * lid.value,
  }));
  const shine = useAnimatedProps(() => ({
    cx: HEAD_EYE.x + HEAD_EYE.shineDx + lookX.value * reach,
    cy: HEAD_EYE.y + HEAD_EYE.shineDy * lid.value + lookY.value * reach * 0.4,
    ry: HEAD_EYE.shine * lid.value,
  }));
  return (
    <>
      <AnimatedEllipse animatedProps={iris} rx={HEAD_EYE.iris} fill={SEEKR_COLORS.iris} />
      <AnimatedEllipse animatedProps={hole} rx={HEAD_EYE.hole} fill={SEEKR_COLORS.eye} />
      <AnimatedEllipse animatedProps={shine} rx={HEAD_EYE.shine} fill={SEEKR_COLORS.shine} />
    </>
  );
}

function WordEye({ cx, ink, lid, lookX, lookY }: EyeMotion & { cx: number; ink: string }) {
  const reach = 9;
  const cy = W.eyeY;
  const ball = useAnimatedProps(() => ({ ry: W.eyeR * (0.15 + 0.85 * lid.value) }));
  const iris = useAnimatedProps(() => ({ ry: WORD_IRIS * lid.value }));
  const pupil = useAnimatedProps(() => ({
    cx: cx + lookX.value * reach,
    cy: cy + lookY.value * reach,
    ry: WORD_PUPIL * lid.value,
  }));
  const shine = useAnimatedProps(() => ({
    cx: cx - 5 + lookX.value * reach,
    cy: cy - 6 * lid.value + lookY.value * reach,
    ry: WORD_SHINE * lid.value,
  }));
  return (
    <>
      <AnimatedEllipse
        animatedProps={ball}
        cx={cx}
        cy={cy}
        rx={W.eyeR}
        fill={SEEKR_COLORS.body}
        stroke={ink}
        strokeWidth={4}
      />
      <AnimatedEllipse
        animatedProps={iris}
        cx={cx}
        cy={cy}
        rx={WORD_IRIS}
        fill={SEEKR_COLORS.iris}
      />
      <AnimatedEllipse animatedProps={pupil} rx={WORD_PUPIL} fill={SEEKR_COLORS.body} />
      <AnimatedEllipse animatedProps={shine} rx={WORD_SHINE} fill={SEEKR_COLORS.shine} />
    </>
  );
}

export const AniseekrLogo = memo(AniseekrLogoComponent);
