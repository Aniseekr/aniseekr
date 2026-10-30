import { memo, useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ThemedText } from '../themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useT, type TranslationKey } from '../../libs/i18n';

// Seekr the black ninja, in the v6 manga × cartoon-ad poses from aniseekr.moe.
// Decorative, but alive: a tap makes him hop and pops a sound-effect word.

const POSES = {
  leap: require('../../assets/seekr/leap.webp'),
  phone: require('../../assets/seekr/phone.webp'),
  point: require('../../assets/seekr/point.webp'),
  read: require('../../assets/seekr/read.webp'),
} as const;

// Source art is 548–588 × 640; 0.9 keeps every pose inside its box.
const ASPECT = 0.9;

const SFX: TranslationKey[] = ['brand.sfx.hop', 'brand.sfx.nin', 'brand.sfx.whoosh'];

export type SeekrPoseName = keyof typeof POSES;

interface SeekrPoseProps {
  pose: SeekrPoseName;
  height: number;
  style?: ViewStyle;
}

function SeekrPoseComponent({ pose, height, style }: SeekrPoseProps) {
  const t = useT();
  const reduced = useReducedMotion();
  const taps = useRef(0);
  const [sfx, setSfx] = useState<TranslationKey | null>(null);
  const hop = useSharedValue(0);
  const tilt = useSharedValue(0);
  const pop = useSharedValue(0);

  const onPress = useCallback(() => {
    hapticsBridge.tap();
    setSfx(SFX[taps.current++ % SFX.length]);
    if (reduced) {
      pop.value = withSequence(withTiming(1, { duration: 0 }), withDelay(1100, withTiming(0)));
      return;
    }
    hop.value = withSequence(
      withTiming(-height * 0.12, { duration: 130, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 7, stiffness: 280 })
    );
    tilt.value = withSequence(withTiming(-7, { duration: 90 }), withSpring(0, { damping: 6 }));
    pop.value = withSequence(
      withTiming(0, { duration: 0 }),
      withSpring(1, { damping: 8, stiffness: 320 }),
      withDelay(900, withTiming(0, { duration: 200 }))
    );
  }, [height, hop, pop, reduced, tilt]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hop.value }, { rotate: `${tilt.value}deg` }],
  }));
  const sfxStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.6 + pop.value * 0.4 }, { rotate: '-12deg' }],
  }));

  const width = height * ASPECT;

  return (
    <View
      style={[{ width, height }, style]}
      accessible={false}
      importantForAccessibility="no-hide-descendants">
      <Pressable onPress={onPress} style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, bodyStyle]}>
          <Image source={POSES[pose]} style={StyleSheet.absoluteFill} contentFit="contain" />
        </Animated.View>
      </Pressable>
      <Animated.View pointerEvents="none" style={[styles.sfx, sfxStyle]}>
        {sfx ? (
          <ThemedText variant="headlineLarge" tone="accent" weight="800">
            {t(sfx)}
          </ThemedText>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sfx: {
    position: 'absolute',
    top: 0,
    right: -8,
  },
});

export const SeekrPose = memo(SeekrPoseComponent);
