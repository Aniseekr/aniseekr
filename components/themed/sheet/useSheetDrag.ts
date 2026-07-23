import { useCallback } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Springs } from '../../../libs/animations/presets';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

/* eslint-disable react-hooks/immutability */
const DRAG_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 800;
const ELASTIC_LIMIT = 200;
const ELASTIC_FACTOR = 0.4;
const DISMISS_TARGET = 600;

export function useSheetDrag(onClose: () => void) {
  const translateY = useSharedValue(0);
  const hasThresholdHaptic = useSharedValue(false);

  const reset = useCallback(() => {
    translateY.value = 0;
    hasThresholdHaptic.value = false;
  }, [hasThresholdHaptic, translateY]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      const raw = Math.max(0, event.translationY);
      if (raw <= ELASTIC_LIMIT) {
        translateY.value = raw;
      } else {
        const overshoot = raw - ELASTIC_LIMIT;
        translateY.value = ELASTIC_LIMIT + overshoot * ELASTIC_FACTOR;
      }
    })
    .onEnd((event) => {
      const shouldDismiss =
        translateY.value > DRAG_THRESHOLD || event.velocityY > VELOCITY_THRESHOLD;
      if (shouldDismiss) {
        translateY.value = withSpring(DISMISS_TARGET, Springs.sheet);
        scheduleOnRN(onClose);
      } else {
        translateY.value = withSpring(0, Springs.sheet);
      }
      hasThresholdHaptic.value = false;
    });

  useAnimatedReaction(
    () => translateY.value > DRAG_THRESHOLD,
    (crossed, previous) => {
      if (crossed && !previous && !hasThresholdHaptic.value) {
        hasThresholdHaptic.value = true;
        scheduleOnRN(hapticsBridge.swipeThreshold);
      } else if (!crossed && previous) {
        hasThresholdHaptic.value = false;
      }
    }
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: interpolate(translateY.value, [0, 400], [1, 0.94], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(translateY.value, [0, 400], [1, 0.3], Extrapolation.CLAMP),
  }));

  return { panGesture, sheetAnimatedStyle, reset };
}
