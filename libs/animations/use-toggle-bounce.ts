import { useEffect, useRef } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Springs } from './presets';

/**
 * Pop (and optionally wiggle) when `active` flips on. Mount and turning off stay
 * still, so a list painting already-picked rows doesn't bounce every row.
 */
export function useToggleBounce(active: boolean, wiggle = false) {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const previous = useRef(active);
  useEffect(() => {
    if (active && !previous.current) {
      scale.value = withSequence(withTiming(0.8, { duration: 70 }), withSpring(1, Springs.pop));
      if (wiggle) {
        rotate.value = withSequence(
          withTiming(-16, { duration: 70 }),
          withTiming(14, { duration: 90 }),
          withTiming(-8, { duration: 80 }),
          withSpring(0, Springs.pop)
        );
      }
    }
    previous.current = active;
  }, [active, wiggle, scale, rotate]);
  return useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));
}
