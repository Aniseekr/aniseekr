import { useCallback, useMemo, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import type { ComposedGesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';
import type { OverlayTransformValues } from '../components/pilgrimage/camera/types';

interface UseOverlayTransformInput {
  enabled: boolean;
}

interface UseOverlayTransformOutput {
  composedGesture: ComposedGesture;
  animatedStyle: ViewStyle;
  transformed: boolean;
  rotationDisplayDeg: number;
  getSnapshot: () => OverlayTransformValues;
  resetTransforms: () => void;
  toggleFlip: () => void;
  flipped: boolean;
}

export function useOverlayTransform({
  enabled,
}: UseOverlayTransformInput): UseOverlayTransformOutput {
  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const baseTranslateX = useSharedValue(0);
  const baseTranslateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const baseRotation = useSharedValue(0);
  const flipScale = useSharedValue(1);

  const [transformed, setTransformed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [rotationDisplayDeg, setRotationDisplayDeg] = useState(0);

  const markTransformed = useCallback(() => {
    setTransformed(true);
  }, []);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(enabled)
        .onStart(() => {
          baseScale.value = scale.value;
        })
        .onUpdate((e) => {
          const next = baseScale.value * e.scale;
          scale.value = Math.max(0.25, Math.min(4, next));
        })
        .onEnd(() => {
          if (Math.abs(scale.value - 1) > 0.01) runOnJS(markTransformed)();
        }),
    [enabled, scale, baseScale, markTransformed]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .minDistance(4)
        .onStart(() => {
          baseTranslateX.value = translateX.value;
          baseTranslateY.value = translateY.value;
        })
        .onUpdate((e) => {
          translateX.value = baseTranslateX.value + e.translationX;
          translateY.value = baseTranslateY.value + e.translationY;
        })
        .onEnd(() => {
          if (Math.abs(translateX.value) > 1 || Math.abs(translateY.value) > 1) {
            runOnJS(markTransformed)();
          }
        }),
    [enabled, translateX, translateY, baseTranslateX, baseTranslateY, markTransformed]
  );

  const rotate = useMemo(
    () =>
      Gesture.Rotation()
        .enabled(enabled)
        .onStart(() => {
          baseRotation.value = rotation.value;
        })
        .onUpdate((e) => {
          rotation.value = baseRotation.value + e.rotation;
        })
        .onEnd(() => {
          if (Math.abs(rotation.value) > 0.005) runOnJS(markTransformed)();
        }),
    [enabled, rotation, baseRotation, markTransformed]
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(pinch, pan, rotate),
    [pinch, pan, rotate]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotation.value}rad` },
      { scaleX: flipScale.value },
    ],
  }));

  // Replaces an 80ms setInterval that fired ~12 React renders/sec while idle.
  // useDerivedValue runs on the UI thread per shared-value change; the 120ms
  // gate caps JS-thread updates to ~8/sec and only fires when rotation actually moves.
  const lastUpdate = useSharedValue(0);
  useDerivedValue(() => {
    const now = Date.now();
    if (now - lastUpdate.value < 120) return;
    lastUpdate.value = now;
    const deg = Math.round((rotation.value * 180) / Math.PI);
    runOnJS(setRotationDisplayDeg)(deg);
  });

  const resetTransforms = useCallback(() => {
    hapticsBridge.tap();
    scale.value = withSpring(1);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    rotation.value = withSpring(0);
    flipScale.value = withSpring(1);
    setFlipped(false);
    setTransformed(false);
  }, [scale, translateX, translateY, rotation, flipScale]);

  const getSnapshot = useCallback(
    (): OverlayTransformValues => ({
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
      rotationRad: rotation.value,
      flipScaleX: flipScale.value < 0 ? -1 : 1,
    }),
    [scale, translateX, translateY, rotation, flipScale]
  );

  const toggleFlip = useCallback(() => {
    hapticsBridge.selection();
    const next = !flipped;
    setFlipped(next);
    flipScale.value = withSpring(next ? -1 : 1);
    markTransformed();
  }, [flipped, flipScale, markTransformed]);

  return {
    composedGesture,
    animatedStyle,
    transformed,
    rotationDisplayDeg,
    getSnapshot,
    resetTransforms,
    toggleFlip,
    flipped,
  };
}
