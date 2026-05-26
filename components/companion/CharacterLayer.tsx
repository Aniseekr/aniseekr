// Companion composer (Track D Phase 1) — gesture-driven character overlay.
//
// Renders a character cutout on top of whatever's underneath (camera frame
// in the future compare integration, or a chosen background in the
// standalone companion screen). All gesture state lives on Reanimated
// SharedValues so the JS thread stays cold during drag — per CLAUDE.md
// rule 9, high-frequency values never enter React state.
//
// Interactions:
//   - 1 finger pan        → translate
//   - 2-finger pinch      → uniform scale (clamped 0.2×–3×)
//   - 2-finger rotate     → rotate (composed with pinch)
//   - Double-tap          → flip horizontally
//   - Long-press          → caller-supplied (e.g. open picker to swap)
//
// `parentSize` is required so we can centre the layer relative to the
// captured frame. The component does NOT clip itself to parent bounds —
// the parent View should set `overflow: 'hidden'` if it wants to crop.

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

export type CharacterLayerProps = {
  cutoutUri: string;
  intrinsicW: number;
  intrinsicH: number;
  parentSize: { width: number; height: number };
  /** 0–1 of parent height for the initial layer height. Default 0.6. */
  initialHeightFraction?: number;
  /** Optional callback for long-press to swap characters. */
  onLongPress?: () => void;
  /** When false, the layer ignores all gestures (capture-ready mode). */
  editMode?: boolean;
};

const MIN_SCALE = 0.2;
const MAX_SCALE = 3.0;

export function CharacterLayer({
  cutoutUri,
  intrinsicW,
  intrinsicH,
  parentSize,
  initialHeightFraction = 0.6,
  onLongPress,
  editMode = true,
}: CharacterLayerProps) {
  const aspect = intrinsicW > 0 && intrinsicH > 0 ? intrinsicW / intrinsicH : 0.75;
  const initialH = Math.max(120, parentSize.height * initialHeightFraction);
  const initialW = initialH * aspect;

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const flipX = useSharedValue(1);

  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedRotation = useSharedValue(0);

  const composed = useMemo(() => {
    const pan = Gesture.Pan()
      .onUpdate((e) => {
        'worklet';
        tx.value = savedTx.value + e.translationX;
        ty.value = savedTy.value + e.translationY;
      })
      .onEnd(() => {
        'worklet';
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      });

    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        'worklet';
        const next = savedScale.value * e.scale;
        scale.value = next < MIN_SCALE ? MIN_SCALE : next > MAX_SCALE ? MAX_SCALE : next;
      })
      .onEnd(() => {
        'worklet';
        savedScale.value = scale.value;
      });

    const rotate = Gesture.Rotation()
      .onUpdate((e) => {
        'worklet';
        rotation.value = savedRotation.value + e.rotation;
      })
      .onEnd(() => {
        'worklet';
        savedRotation.value = rotation.value;
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        'worklet';
        // SharedValues are write-safe inside worklets; call back via runOnJS
        // would be needed only if we wanted to surface this to React.
        flipX.value = flipX.value * -1;
      });

    const longPress = Gesture.LongPress()
      .minDuration(450)
      .onStart(() => {
        'worklet';
        if (onLongPress) runOnJS(onLongPress)();
      });

    return Gesture.Exclusive(
      longPress,
      Gesture.Race(doubleTap, Gesture.Simultaneous(pan, pinch, rotate))
    );
  }, [tx, ty, scale, rotation, flipX, savedTx, savedTy, savedScale, savedRotation, onLongPress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
      { rotateZ: `${rotation.value}rad` },
      { scaleX: flipX.value },
    ],
  }));

  const layer = (
    <Animated.View
      style={[
        styles.layer,
        {
          width: initialW,
          height: initialH,
          left: parentSize.width / 2 - initialW / 2,
          top: parentSize.height / 2 - initialH / 2,
        },
        animatedStyle,
      ]}>
      <Image
        source={{ uri: cutoutUri }}
        style={StyleSheet.absoluteFillObject}
        contentFit="contain"
      />
    </Animated.View>
  );

  if (!editMode) {
    return <View pointerEvents="none">{layer}</View>;
  }

  return <GestureDetector gesture={composed}>{layer}</GestureDetector>;
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
  },
});
